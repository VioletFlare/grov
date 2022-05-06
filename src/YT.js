const ytdl = require("ytdl-core");

class YT {

    getStream(currentSongURL) {
        let stream = ytdl(currentSongURL, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        });

        return stream;
    }

    getBasicInfo(url) {
        return ytdl.getBasicInfo(url);
    }

}

module.exports = new YT();