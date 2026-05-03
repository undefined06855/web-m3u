# web-m3u

A self-hosted m3u generator for playlists!

Start by creating a folder called "music" and place folders containing audio files inside.

Set the `PORT`, `DOMAIN` and `DEVELOPMENT` environment variables, or create a `.env` file which Bun will automatically load. Run
`bun i` and then `bun main` to start hosting!

## Example Setup

With a folder structure as follows:
```
.
├── .gitignore
├── bun.lock
├── main.js
├── package.json
├── README.md
├── tsconfig.json
|
├── .env
└── music/
    ├── my-playlist-1/
    │   ├── song-by-me.mp3
    │   └── song2-also-by-me.mp3
    └── epic-playlist/
        └── djrubrub.mp3
        └── config.json
```

With the `.env` file containing:
```
PORT=8080
DOMAIN=http://localhost:8080 # for generating urls in the m3u
DEVELOPMENT=true
```
(Note: These are the defaults!)

Navigating to `http://localhost:8080/my-playlist-1.m3u` then gives the following m3u file:
```
#EXTM3U

#EXTART:Me
#PLAYLIST:My Playlist 1

http://localhost:8080/my-playlist-1/song-by-me.mp3
http://localhost:8080/my-playlist-1/song2-also-by-me.mp3
```

The `config.json` shown in Epic Playlist can contain the following information (which is passed into the .m3u):
```json
{
    "name": "Name of the playlist to override the auto-generated one",

    "group": "Group passed to the EXTGRP tag",

    "album": "Album passed to the EXTALB tag to override the auto-generated one",
    "artist": "Artist passed to the EXTART tag to override the auto-generated one",
    "genre": "Genre passed to the EXTGENRE tag to override the auto-generated one"
}
```

## Notes
- If there are more than 4 artists, genres or albums, the auto-generated artist/genre/album list will be "Various Artists", "Various Genres" or "Various Albums".
- The music directory can be a symlink to somewhere else!

---

This project was created using `bun init` in bun v1.3.12. [Bun](https://bun.com) is a fast all-in-one JavaScript
runtime.
