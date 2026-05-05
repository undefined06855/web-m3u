import * as fs from "fs/promises";

import * as changeCase from "change-case";
import * as musicMetadata from "music-metadata";
import * as shuffler from "array-shuffle";
import * as crlf from "crlf-normalize";
import mime from "mime";
import sanitize from "sanitize-filename";
import M3uAssembler from "./m3uassembler";

import config from "./config.toml";
import nodePackage from "./package.json";

import index from "./index.html" with { type: "text" };

let server = Bun.serve({
    routes: {
        "/": async () => {
            let innerContent = "";
            let playlistCount = 0;

            for (let folder of await fs.readdir("music", { withFileTypes: true })) {
                if (!folder.isDirectory()) continue;
                if (folder.name == ".web-m3u-cache") continue;
                let cacheFile = Bun.file(`music/.web-m3u-cache/playlist-${Bun.hash(folder.name).toString(16)}.json`);

                if (await cacheFile.exists()) {
                    let cacheData = await cacheFile.json().catch(exception => {
                        cacheFile.delete();
                        console.warn(exception);
                    });

                    if (!cacheData) continue;

                    if (cacheData.covers) {
                        shuffler.arrayShuffle(cacheData.covers);
                        let coverCount = Math.min(cacheData.covers.length, 6);
                        for (let i = 0; i < coverCount; i++) {
                            innerContent += `<img src="${cacheData.covers[i]}" alt="playlist cover ${i + 1} for ${changeCase.sentenceCase(folder.name)}" height=64/>`;
                        }
                    }
                }

                innerContent += `<a href="${config.Generation.domain}/${folder.name}.m3u">${changeCase.capitalCase(folder.name)}</a><br/>`;
                playlistCount++;
            }

            let rewriter = new HTMLRewriter()
                .on("div#playlists", {
                    element(e) { e.setInnerContent(innerContent, { html: true }); }
                })
                .on("#playlist-count", {
                    element(e) { e.setInnerContent(playlistCount); }
                })
                .on("#version", {
                    element(e) { e.setInnerContent(nodePackage.version) }
                })

            return new Response(
                rewriter.transform(index),
                {
                    headers: { "Content-Type": "text/html" }
                }
            );
        },

        "/:playlist": async req => {
            let playlist = sanitize(req.params.playlist)
                    .replace(".m3u8", "")
                    .replace(".m3u", "");

            let shuffle = false;
            if (playlist.endsWith("-shuffle")) {
                shuffle = true;
                playlist = playlist.replace("-shuffle", "");
            }

            try { await fs.access(`music/${playlist}`); }
            catch { return new Response("playlist not found", { status: 404 }); }

            let assembler = new M3uAssembler();
            let artists = [];
            let albums = [];
            let genres = [];

            let covers = [];

            let metadataConfig = {
                duration: true
            };

            /** @type {Array<Promise<musicMetadata.IAudioMetadata>>} */
            let fileParsePromises = [];

            // read and add files, and read the metadata from them
            for (let file of await fs.readdir(`music/${playlist}`, { withFileTypes: true })) {
                if (!file.isFile()) continue;

                // skip non audio files
                let bunFile = Bun.file(`${file.parentPath}/${file.name}`);
                if (!bunFile.type.startsWith("audio/")) continue;

                // check if metadata is cached
                let cacheFilename = Bun.hash(`${playlist}/${file.name}`).toString(16);
                let cacheFile = Bun.file(`music/.web-m3u-cache/${cacheFilename}.json`);

                if (await cacheFile.exists()) {
                    let metadata = await cacheFile.json().catch(exception => {
                        cacheFile.delete();
                        console.warn(exception);
                    });

                    // the cache file is made up of m3u tags and other data
                    // make sure to delete the other data keys so that they don't get improperly added as m3u tags
                    if (metadata.artists) { artists.push(...metadata.artists); delete metadata.artists; }
                    if (metadata.album) { albums.push(metadata.album); delete metadata.album; }
                    if (metadata.genre) { genres.push(...metadata.genre); delete metadata.genre; }
                    if (metadata.EXTALBUMARTURL) { covers.push(metadata.EXTALBUMARTURL); }

                    assembler.addFile(`${config.Generation.domain}/${encodeURIComponent(playlist)}/${encodeURIComponent(file.name)}`, metadata);
                } else {
                    // we don't have cache, add to a list of promises and parse with music-metadata
                    fileParsePromises.push(
                        musicMetadata.parseFile(`${file.parentPath}/${file.name}`, metadataConfig)
                            .then(async metadata => {
                                let m3uMetadata = {};
                                if (metadata.common.artists) artists.push(...metadata.common.artists);
                                if (metadata.common.album) albums.push(metadata.common.album);
                                if (metadata.common.genre) genres.push(...metadata.common.genre);

                                m3uMetadata["EXTINF"] = `${metadata.format.duration}`;
                                m3uMetadata["EXTBYT"] = `${bunFile.size}`;

                                if (metadata.common.title) {
                                    if (metadata.common.artists) {
                                        m3uMetadata["EXTINF"] += `,${metadata.common.artists.join(", ")} - ${metadata.common.title}`;
                                    } else {
                                        m3uMetadata["EXTINF"] += `,${metadata.common.title}`;
                                    }
                                }

                                if (config.Generation.album_art) {
                                    let cover = musicMetadata.selectCover(metadata.common.picture);
                                    if (cover) {
                                        let coverExtension = mime.getExtension(cover.format);
                                        let coverFile = Bun.file(`music/.web-m3u-cache/${cacheFilename}.${coverExtension}`);
                                        if (!await coverFile.exists()) {
                                            coverFile.write(cover.data);
                                        }

                                        let coverUrl = `${config.Generation.domain}/.cache/${cacheFilename}.${coverExtension}`;
                                        m3uMetadata["EXTALBUMARTURL"] = coverUrl;
                                        covers.push(coverUrl);
                                    }
                                }

                                assembler.addFile(`${config.Generation.domain}/${encodeURIComponent(playlist)}/${encodeURIComponent(file.name)}`, m3uMetadata);

                                // make sure to write to a cache file afterwards so this slow process doesn't have to be
                                // repeated again
                                let cacheData = { ...m3uMetadata };

                                if (metadata.common.artists) cacheData.artists = metadata.common.artists;
                                if (metadata.common.album) cacheData.album = metadata.common.album;
                                if (metadata.common.genre) cacheData.genre = metadata.common.genre;

                                cacheFile.write(JSON.stringify(cacheData)).catch(console.warn);
                            })
                            .catch(console.warn)
                    );
                }
            }

            // ...wait for all the files to be read for metadata
            await Promise.allSettled(fileParsePromises);

            albums = [...new Set(albums)];
            artists = [...new Set(artists)];
            genres = [...new Set(genres)];

            assembler.addMetadataEntry("PLAYLIST", changeCase.capitalCase(playlist));
            assembler.addMetadataEntry("EXTALB", albums.length == 0 ? "Unknown" : albums.length > 4 ? "Various Albums" : albums.join(", "));
            assembler.addMetadataEntry("EXTART", artists.length == 0 ? "Unknown" : artists.length > 4 ? "Various Artists" : artists.join(", "));
            assembler.addMetadataEntry("EXTGENRE", genres.length == 0 ? "Unknown" : genres.length > 4 ? "Various Genres" : genres.join(", "));

            // apply user-configured metadata after to override autogenerated ones
            let configFile = Bun.file(`music/${playlist}/config.json`);
            if (await configFile.exists()) {
                let config = await configFile.json().catch(console.warn);
                if (config) {
                    assembler.addMetadataEntry("EXTALB", config.album);
                    assembler.addMetadataEntry("EXTART", config.artist);
                    assembler.addMetadataEntry("EXTGENRE", config.genre);
                    assembler.addMetadataEntry("EXTGRP", config.group);
                }
            }

            let playlistCache = Bun.file(`music/.web-m3u-cache/playlist-${Bun.hash(playlist).toString(16)}.json`);
            playlistCache.write(JSON.stringify({ covers, albums, artists, genres }));

            assembler.addComment("Generated by web-m3u: https://github.com/undefined06855/web-m3u");

            if (shuffle) {
                shuffler.arrayShuffle(assembler.files);
            } else {
                assembler.files.sort((a, b) => a.path.localeCompare(b.path));
            }

            return new Response(
                // wikipedia "some devices only accept line breaks represented as CR LF, but do not recognize a single LF."
                crlf.crlf(assembler.assemble(), crlf.CRLF), {
                    "status": 200,
                    "headers": {
                        "Content-Type": "text/plain"
                    }
                }
            );
        },

        "/.cache/:file": async req => {
            return new Response(Bun.file(`music/.web-m3u-cache/${sanitize(req.params.file)}`));
        },

        "/:playlist/:file": async req => {
            return new Response(Bun.file(`music/${sanitize(req.params.playlist)}/${sanitize(req.params.file)}`));
        }
    },

    port: config.Server.port,
    development: config.Server.development,
    idleTimeout: 0
});

console.log(`Hosting web-m3u at port ${server.port}`);
