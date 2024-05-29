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

  *note that this script only works with 4 key maps which are under 3 minutes*

*/

// start the script (put your map id in here)
renderMap(4261332);

async function getMap(beatmapId) { // Function to  pull the map from the osu website

  const SCOPE_LIST = ['public'];
  await auth.login(process.env.PN, process.env.AC, SCOPE_LIST); // log in to osu 
  const map = await v2.beatmap.id.details(beatmapId); // get the mapset id for downloading

  if(map.mode == 'mania' && map.cs == 4 && map.total_length < 180) { // make sure that the map is the right gamemode
      await downloadMap(map.beatmapset_id); // download the map
      console.log('successful')
  } else {
      console.error('invalid map');
  }

  let version = map.version.slice(5);
  version = version.replace(/[/\\?%*:|"<>]/g, ''); 

  const diff = `./downloads/map/${map.beatmapset.artist} - ${map.beatmapset.title} (${map.beatmapset.creator}) [${version}].osu`; // return the difficulty file to the main project

  return diff;

}

async function downloadMap(mapsetId) { // map downloader

  fsExtra.emptyDirSync('./downloads') // empty the downloads folder of any other maps that have bene downloaded

  await auth.login_lazer(process.env.USN, process.env.PSW); // log into osu
  await v2.beatmap.set.download(mapsetId, './downloads/map.zip', 'osu', 'no_video', hii()); // download the map

  await decompress("./downloads/map.zip", "./downloads/map") // decompress the map files
  .catch((error) => {
      console.log(error);
  });

  console.log('done'); 

}

//OVERARCHING FUNCTION

async function renderMap(mapId) {

  // Generate frames and create video

  const path = await getMap(mapId); // get the map

  const decoder = new BeatmapDecoder(); // decode the beatmap into a readable JSON file
  const shouldParseSb = true;
  const beatmap1 = await decoder.decodeFromPath(path, shouldParseSb);
  const map = beatmap1;
  const notes = Object.values(beatmap1.hitObjects);

  const videoData = { // this is where you can change the specifications of your video
    width: 1920,
    height: 1080,
    fps: 30,
    duration: (map.length / 1000) + 2, // in seconds
  };

  // all of the paths

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
    fsExtra.emptyDirSync(framesPath);
  }

  let trueStart = notes[0].startTime - 1000; // make it so the video starts a second before the notes

  generateFrames(map, notes, ctx, videoData, framesPath, canvas, trueStart); // generate the frames
  createVideo(videoPath, videoData, framesPath, audioPath, map, trueStart);
}

// WORKERS

// Function to generate frames
function generateFrames(map, notes, ctx, videoData, framesPath, canvas, trueStart) {
  const totalFrames = videoData.fps * videoData.duration; // get the total number of frames in the video
  const totalNotes = notes.length;
  const rows = new Array(); // rows is how many note columns we will have
  for (let i = 0; i < 4; i++) {
    rows[i] = 0;
  }
  const fpMS = 1000 / videoData.fps; // frames per miliseconds

  const generator = new Array(); // new array of notes to do

  for (let frameNumber = 0; frameNumber < totalFrames + videoData.fps; frameNumber++) {
    // Clear canvas for each frame
    ctx.clearRect(0, 0, videoData.width, videoData.height); // clear the canvas for every frame

    const realMS = ((frameNumber * 1000)) / videoData.fps; // current time in miliseconds

    // COLUMNS = 64, 192, 320, 448

    //////////////////////////////////////////////////
    /*

        The way this works:
        When a note is almost about to be on screen, it gets added to the generator array.
        This array has all of the notes that need to be placed on screen inside of it
        A formula is then used to calculate the distance of the note on the screen, 
        based on how long until it needs to be pressed
        Once a note has reached the note receptor at the bottom of the screen, the receptor flashes to indicate a press.
        Then the note is removed from the array, and the loop continues until the song is completed.

    */
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

      while (notes[i] && ms < map.length + trueStart && notes[i].startTime - ms <= 500) { // Make sure that there are notes left and the video isnt over

        if(notes[i].startTime - 500 <= tfpMS && notes[i].startTime - 500 >= bfpMS) // Check for notes that are meant to be on the screen                
        {

          const n = notes[i]; // the current note 
          //console.log(notes[i].startTime);

          if (n.hitType == 1 || n.hitType == 5) { // rice note (tap note)
            
            let generation = new hitObject(n.startPosition.x, n.startTime, 0); // create a new hitobject to send for generation
            generator.push(generation);
  
          } else { // noodle note (long note / hold note)
  
            let generation = new hitObject(n.startPosition.x, n.startTime, n.endTime); // create a new hitobject to send for generation
            generator.push(generation);

          }

        }

        i++; // continue checking notes

      }

      // RECEPTORS

      while (notes[0] && notes[0].startTime <= tfpMS && notes[0].startTime >= bfpMS && ms < map.length + trueStart) {

        const n = notes[0]; // the note that is closest to the bottom

        if (n.hitType == 1 || n.hitType == 5) { // rice note

          switch (n.startPosition.x) { // tell the script that this note is going to be hit right now
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

          switch (n.startPosition.x) { // tell the script that this note is going to be hit right now
            case 64:
              rows[0] = n.endTime - ms; // make sure that we tell it to hit until the end because this is a long note
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

        notes.shift(); // remove the note that is being hit

      }

      // DRAW THE NOTES! //

      let pos = 736; // position of the first note
      ctx.strokeStyle = "white";
      ctx.fillStyle = "white";

      for (let j = 0; j < rows.length; j++) { // place down all of the notes!

        //console.log(rows[j]);

        // we use node canvas, which is very similar to javascript canvas but it is built for node.

        ctx.strokeStyle = "blue";
        ctx.beginPath();
        ctx.arc(pos, 1000, 50, 0, 2 * Math.PI);
        ctx.stroke();

        if (rows[j] > 0) { // if teh note is being pressed, then fill it in white!
          ctx.font = "50px";
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.fillText(`${rows[j].toFixed(2)}`, pos, 880);
        }

        generator.forEach(element => { // PLACE THE NOTES! we have to loop for every note that we place

          const msToHit = element.startTime - ms; // the amount of time until the note is hit

          //console.log(ms - element.startTime + 1000);

          if (msToHit <= 0 && element.endTime == 0){ // if the note has already passed then GET RID OF IT!
            generator.splice(generator.indexOf(element), 1);
          } else if (element.endTime > 0 && element.endTime - ms < 0) {
            generator.splice(generator.indexOf(element), 1);
          } else { 

            // create the note!

            if(msToHit > 0 && ms - element.startTime + 500 < 1000) { // make the note head

              
              ctx.beginPath();
              ctx.arc(672 + element.row, (ms - element.startTime + 500) * 2, 50, 0, 2 * Math.PI); // we use the formula (ms - element.startTime + 500) * 2 to calculate the vertical position of the note
              ctx.stroke();
              ctx.fill();

            }

          if(element.endTime > 0) { // for long notes
              
              let lnBuffer;
              let endingBuffer;
              if(element.startTime < ms) { // calculate the length of the long note, and make sure that it doesnt go off screen
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

  const command = ffmpeg(); // uses ffmpeg to make video
  const offsetInSeconds = trueStart / 1000;

  command.input(`${framesPath}/frame_%d.png`) // video settings!
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

function hitObject(row, startTime, endTime) { // hitobject constructor for all hitobjects in the video
  this.row = row;
  this.startTime = startTime;
  this.endTime = endTime;
}

function hii() {

}