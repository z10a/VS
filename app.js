const express = require("express");
const { exec } = require("child_process");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const uploadsDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "output");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

app.post("/process", async (req, res) => {
  const { link1, link2, split } = req.body;

  if (!link1 || !link2) {
    return res.status(400).send("Please provide both video links.");
  }

  const id = Date.now();
  const file1 = path.join(uploadsDir, `video1_${id}.mp4`);
  const file2 = path.join(uploadsDir, `video2_${id}.mp4`);
  const output = path.join(outputDir, `final_${id}.mp4`);

  const downloadCmd1 = `yt-dlp -o "${file1}" -f best ${link1}`;
  const downloadCmd2 = `yt-dlp -o "${file2}" -f best ${link2}`;

  console.log("Starting download of video 1");
  exec(downloadCmd1, (err, stdout, stderr) => {
    if (err) {
      console.error("Error downloading video 1:", stderr);
      return res.status(500).send("Failed to download video 1");
    }
    console.log("Downloaded video 1");

    console.log("Starting download of video 2");
    exec(downloadCmd2, (err, stdout, stderr) => {
      if (err) {
        console.error("Error downloading video 2:", stderr);
        return res.status(500).send("Failed to download video 2");
      }
      console.log("Downloaded video 2");

      // Updated FFmpeg command:
      // - No -t 30: use full video durations
      // - Second video fills 720x1280 (9:16) with scale+crop
      // - First video scaled smaller and overlaid centered
      // - Audio only from first video (muted second)
      const ffmpegCmd = `ffmpeg -y -ss 0 -i "${file1}" -ss 0 -i "${file2}" -filter_complex "[1:v]scale=w=720:h=1280:force_original_aspect_ratio=increase,crop=720:1280[base];[0:v]scale=-2:480[overlay];[base][overlay]overlay=(W-w)/2:(H-h)/2:format=auto[outv]" -map "[outv]" -map 0:a -preset veryfast -shortest "${output}"`;


      console.log("Running FFmpeg command...");
      console.log(ffmpegCmd);

      exec(ffmpegCmd, (err, stdout, stderr) => {
        if (err) {
          console.error("FFmpeg error:", stderr);
          return res.status(500).send("FFmpeg failed");
        }
        console.log("FFmpeg finished");

        if (split) {
          const splitCmd = `ffmpeg -y -i "${output}" -c copy -map 0 -f segment -segment_time 30 -reset_timestamps 1 "${outputDir}/part_${id}_%03d.mp4"`;

          console.log("Splitting video into 30s parts...");
          console.log(splitCmd);

          exec(splitCmd, (err, stdout, stderr) => {
            if (err) {
              console.error("Split error:", stderr);
              return res.status(500).send("Split failed");
            }
            console.log("Splitting finished");
            return res.json({ message: "Done and split!", outputFolder: "output/" });
          });
        } else {
          return res.json({ message: "Done! Video created.", outputFile: `output/final_${id}.mp4` });
        }
      });
    });
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
