const fs = require('fs');
const { BeatmapDecoder } = require('osu-parsers');
const { createCanvas, loadImage } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = 'C:/ffmpeg/bin/ffmpeg.exe'; // Specify the full path to the ffmpeg executable
ffmpeg.setFfmpegPath(ffmpegPath);
const { writeFile } = require('fs/promises');
const { v2, auth, tools } = require('osu-api-extended')
require('dotenv').config();
const decompress = require("decompress");
const fsExtra = require('fs-extra');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/*

  OSU Mania Map Renderer                                      
  By Logan.
  
  OSU Mania is a game where notes fall from the top of the screen, and you must hit the corrosponding key once the note reaches the bottom of the screen.
  This script is used to download the song, take the notes and turn it into a preview video.

*/

async function getMap(beatmapId) {

  const SCOPE_LIST = ['public'];
  await auth.login(process.env.PN, process.env.AC, SCOPE_LIST);
  const map = await v2.beatmap.id.details(beatmapId);

  if(map.mode == 'mania' && map.cs == 4 && map.total_length < 180) {
      await downloadMap(map.beatmapset_id);
      console.log('successful')
  } else {
      console.error('invalid map');
  }

  let version = map.version.slice(5);
  version = version.replace(/[/\\?%*:|"<>]/g, '');

  const diff = `./downloads/map/${map.beatmapset.artist} - ${map.beatmapset.title} (${map.beatmapset.creator}) [${version}].osu`;

  return diff;

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




renderMap(4261332);




//OVERARCHING FUNCTION

async function renderMap(mapId) {

  // Generate frames and create video

  const path = await getMap(mapId);

  console.log(path);

  const decoder = new BeatmapDecoder();
  const shouldParseSb = true;
  const beatmap1 = await decoder.decodeFromPath(path, shouldParseSb);
  const map = beatmap1;
  const notes = Object.values(beatmap1.hitObjects);

  const videoData = {
    width: 1920,
    height: 1080,
    fps: 30,
    duration: (map.length / 1000) + 2, // in seconds
  };

  const framesPath = 'frames';
  const videoPath = 'output_video.mp4';
  const audioPath = `./downloads/map/${map.general.audioFilename}`; //maps/superidol/audio.mp3 
  const canvas = createCanvas(videoData.width, videoData.height);
  const ctx = canvas.getContext('2d');

  // Ensure the frames directory exists
  if (!fs.existsSync(framesPath)) {
    fs.mkdirSync(framesPath);
  } else {
    // Remove all files from the frames directory
    /*fs.readdirSync(framesPath).forEach(file => {
      const filePath = `${framesPath}/${file}`;
      fs.unlinkSync(filePath);
      console.log(`Removed file: ${filePath}`);
    });*/
    fsExtra.emptyDirSync(framesPath);
  }

  let trueStart = notes[0].startTime - 1000;

  generateFrames(map, notes, ctx, videoData, framesPath, canvas, trueStart);
  createVideo(videoPath, videoData, framesPath, audioPath, map, trueStart);
}

// WORKERS

// Function to generate frames
function generateFrames(map, notes, ctx, videoData, framesPath, canvas, trueStart) {
  const totalFrames = videoData.fps * videoData.duration;
  const totalNotes = notes.length;
  const rows = new Array();
  for (let i = 0; i < 4; i++) {
    rows[i] = 0;
  }
  const fpMS = 1000 / videoData.fps;

  const generator = new Array();

  for (let frameNumber = 0; frameNumber < totalFrames + videoData.fps; frameNumber++) {
    // Clear canvas for each frame
    ctx.clearRect(0, 0, videoData.width, videoData.height);

    const realMS = ((frameNumber * 1000)) / videoData.fps;

    // COLUMNS = 64, 192, 320, 448

    //////////////////////////////////////////////////

    // CANVAS HERE

    // CALCULATE 
      const ms = realMS - 1000 + trueStart;
      const bfpMS = ms - fpMS; // low end of the frame
      const tfpMS = ms + fpMS; // high end of the frame

      for (let i = 0; i < 4; i++) {
        rows[i] = rows[i] - fpMS;
        if (rows[i] < 0) { rows[i] = 0; }
      }

      // NOTES
      let i = 0;

      while (notes[i] && ms < map.length + trueStart && notes[i].startTime - ms <= 500) { // && 

        if(notes[i].startTime - 500 <= tfpMS && notes[i].startTime - 500 >= bfpMS)
        {

          const n = notes[i];
          //console.log(notes[i].startTime);

          if (n.hitType == 1 || n.hitType == 5) { // rice note
            
            let generation = new hitObject(n.startPosition.x, n.startTime, 0);
            generator.push(generation);
  
          } else {
  
            let generation = new hitObject(n.startPosition.x, n.startTime, n.endTime);
            generator.push(generation);

          }

        }

        i++;

      }

      // RECEPTORS

      while (notes[0] && notes[0].startTime <= tfpMS && notes[0].startTime >= bfpMS && ms < map.length + trueStart) {

        const n = notes[0];

        if (n.hitType == 1 || n.hitType == 5) { // rice note

          switch (n.startPosition.x) {
            case 64:
              rows[0] += 50;
              break;
            case 192:
              rows[1] += 50;
              break;
            case 320:
              rows[2] += 50;
              break;
            case 448:
              rows[3] += 50;
              break;
          }

        } else { // long note

          switch (n.startPosition.x) {
            case 64:
              rows[0] = n.endTime - ms;
              break;
            case 192:
              rows[1] = n.endTime - ms;
              break;
            case 320:
              rows[2] = n.endTime - ms;
              break;
            case 448:
              rows[3] = n.endTime - ms;
              break;
          }

        }

        notes.shift();

      }

      // DRAW //

      let pos = 736;
      ctx.strokeStyle = "white";
      ctx.fillStyle = "white";

      for (let j = 0; j < rows.length; j++) {

        //console.log(rows[j]);

        ctx.strokeStyle = "blue";
        ctx.beginPath();
        ctx.arc(pos, 1000, 50, 0, 2 * Math.PI);
        ctx.stroke();

        if (rows[j] > 0) {
          ctx.font = "50px";
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.fillText(`${rows[j].toFixed(2)}`, pos, 880);
        }

        generator.forEach(element => {

          const msToHit = element.startTime - ms;

          //console.log(ms - element.startTime + 1000);

          if (msToHit <= 0 && element.endTime == 0){
            generator.splice(generator.indexOf(element), 1);
          } else if (element.endTime > 0 && element.endTime - ms < 0) {
            generator.splice(generator.indexOf(element), 1);
          } else { 

            if(msToHit > 0 && ms - element.startTime + 500 < 1000) {

              
              ctx.beginPath();
              ctx.arc(672 + element.row, (ms - element.startTime + 500) * 2, 50, 0, 2 * Math.PI);
              ctx.stroke();
              ctx.fill();

            }

          if(element.endTime > 0) {
              
              let lnBuffer;
              let endingBuffer;
              if(element.startTime < ms) { 
                lnBuffer = 1000; 
                endingBuffer = -(element.endTime - ms);
              } else { 
                lnBuffer = (ms - element.startTime + 500) * 2; 
                endingBuffer = -(element.endTime - element.startTime);
              } 
              //if(element.startTime > ms && element.startTime - ms)
              ctx.fillRect(672 - 50 + element.row, lnBuffer, 100, endingBuffer * 2);
              
              ctx.beginPath();
              ctx.arc(672 + element.row, (ms - element.endTime + 500) * 2, 50, 0, 2 * Math.PI);
              ctx.stroke();
              ctx.fill();

            // set length to endtime-start time
            // then when its past start time user element.endTIme - ms
            }
          }

        });

        pos += 128; 
      ////////////////////////////////////////////////////////////
    }

    // Save the frame as an image
    const framePath = `${framesPath}/frame_${frameNumber}.png`;
    fs.writeFileSync(framePath, canvas.toBuffer());

    console.log(`Frame ${frameNumber} generated`);

  }
}

// Function to create video from frames
function createVideo(videoPath, videoData, framesPath, audioPath, map, trueStart) {

  const command = ffmpeg();
  const offsetInSeconds = trueStart / 1000;

  command.input(`${framesPath}/frame_%d.png`)
    .inputFormat('image2')
    .inputFPS(videoData.fps)
    .input(audioPath)
    .inputOptions('-itsoffset 1')  
    .inputOptions(`-ss ${offsetInSeconds.toFixed(3)}`)
    .output(videoPath)
    .on('end', () => console.log('Video export finished'))
    .run();
}

// CONSTRUCTORS

function hitObject(row, startTime, endTime) {
  this.row = row;
  this.startTime = startTime;
  this.endTime = endTime;
}

function hii() {

}