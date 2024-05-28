const { BeatmapDecoder } = require('osu-parsers');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs')
const { writeFile } = require('fs/promises');
const { v2, auth, tools } = require('osu-api-extended')
require('dotenv').config();
const decompress = require("decompress");
const fsExtra = require('fs-extra');

async function getNotes(path) {

    const decoder = new BeatmapDecoder();
    const shouldParseSb = true;
    const beatmap1 = await decoder.decodeFromPath(path, shouldParseSb);
    delete beatmap1.hitObjects;
    console.log(beatmap1.general.audioFilename);

}

getMap(4459742);

async function getMap(beatmapId) {

    const SCOPE_LIST = ['public'];
    await auth.login('29122', 'tMOv8gU5ccXCskBw7pxc8bHnTRR6YGkqS0DueCPJ', SCOPE_LIST);
    const map = await v2.beatmap.id.details(beatmapId);

    console.log(map);

    if(map.mode == 'mania' && map.cs == 4 && map.total_length < 180) {
        await downloadMap(map.beatmapset_id);
        console.log('successful')
    } else {
        console.error('invalid map');
    }

    const version = map.version.slice(5);
    version = version.replace(/[/\\?%*:|"<>]/g, '-');

    const diff = `./downloads/map/${map.beatmapset.artist} - ${map.beatmapset.title} (${map.beatmapset.creator}) [${version}]`;

}

async function downloadMap(mapsetId) {

    fsExtra.emptyDirSync('./downloads')

    await auth.login_lazer(process.env.USN, process.env.PSW);
    await v2.beatmap.set.download(mapsetId, './downloads/map.zip', 'osu', 'no_video', hii());

    await decompress("./downloads/map.zip", "./downloads/map")
    .catch((error) => {
        console.log(error);
    });

    console.log('done');

}


function hii() {

}

