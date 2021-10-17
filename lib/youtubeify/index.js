const yts = require('yt-search');
const spotifyApi = require('spotify-url-info');

//https://www.npmjs.com/package/spdl-core
//Version 2.0.2

//Accept track URL and return a youtube url.

const youtubeify = async (url) => {
  return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
    try {
      if (!SPDLCore.validateURL(url)) return reject(new Error('Invalid URL'));
      const infos = await spotifyApi.getPreview(url);
      if (!infos || infos.type !== 'track') return reject(new Error('Track not found'));
      let video = await yts(`${infos.track} ${infos.artist}`);
      const foundVideo = video && video.videos && video.videos.length;
      if (!foundVideo) video = await yts(`${infos.track}`);
      if (!foundVideo) return reject(new Error('Track not found'));
      return resolve(video.videos[0].url);
    } catch (err) {
      return reject(err);
    }
  });
};

class SPDLCore {
  constructor () {
    throw new Error(`The ${this.constructor.name} class may not be instantiated!`);
  }

  /**
   * Returns true if url is a spotify track link
   * @param {string} url The spotify url
   * @param {'album' | 'track' | 'playlist'} type The url type
   * @returns {boolean} Is a spotify link
   */
  static validateURL (url, type = 'track') {
    switch (type) {
      case 'track':
        return /^https?:\/\/(?:open|play)\.spotify\.com\/track\/[\w\d]+$/i.test(SPDLCore.parse(url));
      case 'album':
        return /^https?:\/\/(?:open|play)\.spotify\.com\/album\/[\w\d]+$/i.test(SPDLCore.parse(url));
      case 'playlist':
        return /^https?:\/\/(?:open|play)\.spotify\.com\/playlist\/[\w\d]+$/i.test(SPDLCore.parse(url));
      default:
        return false;
    }
  }

  /**
   * Returns a beautified spotify url
   * @param {string} url The url to beautify
   * @returns {string} The beautified url
   * @private
   * @ignore
   */
  static parse (url) {
    return url.split('?')[0];
  }
}

youtubeify.validateURL = SPDLCore.validateURL;
module.exports = youtubeify;
