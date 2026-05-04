/**
 * @class M3uAssembler
 * @description Naively assembles an m3u file from provided metadata and file paths.
 */
export default class M3uAssembler {
    constructor() {
        this.metadata = {};
        this.comments = [];
        this.files = [];
    }

    /**
     * Adds a comment to the top of the file, after metadata, but before files.
     * @param {string} comment
     */
    addComment(comment) {
        if (typeof comment !== "string") return;
        this.comments.push(comment);
    }

    /**
     * Sets a global metadata entry in the .m3u file.
     * @param {string} directive
     * @param {string} data
     */
    addMetadataEntry(directive, data) {
        if (typeof directive !== "string") return;
        if (typeof data !== "string") return;
        this.metadata[directive] = data;
    }

    /**
     * Adds a file to the end of the .m3u file. Does not support per-file metadata.
     * @param {string} path
     * @param {Record<string, string>} [metadata={}]
     */
    addFile(path, metadata = {}) {
        if (typeof path !== "string") return;
        if (typeof metadata !== "object") return;
        this.files.push({ path, metadata });
    }

    /**
     * Assembles the info into a .m3u file string.
     * @returns {string} The .m3u file as a string.
     */
    assemble() {
        let output = "#EXTM3U\n\n";

        for (let [directive, data] of Object.entries(this.metadata)) {
            output += `#${directive}:${data}\n`;
        }

        output += "\n";

        for (let comment of this.comments) {
            output += `#${comment}\n`;
        }

        output += "\n";

        for (let file of this.files) {
            for (let [directive, data] of Object.entries(file.metadata)) {
                output += `#${directive}:${data}\n`;
            }

            output += `${file.path}\n\n`;
        }

        return output;
    }
};
