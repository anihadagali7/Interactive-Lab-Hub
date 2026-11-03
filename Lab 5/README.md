# Observant Systems: Overnight Sensation

**Team:**

**Members:** Anirudha Hadagali

**Project name:**

## Overview

**Part 1: the tools**

A) [Set up your Pi for on-device AI](#part-a)

B) [See: recognize people in real time with YOLO](#part-b)

C) [See more: hands and pose with MediaPipe](#part-c)

D) [Reason: run Qwen on the Pi with Ollama](#part-d)

E) [Connect: from YOLO readings to Qwen reasoning](#part-e)

**Part 2: Overnight Sensation**

F) [Read Part 2 and storyboard your night-time interaction](#part-f)

G) [Design the interaction before bed](#part-g)

H) [Incorporate the observant system during sleep](#part-h)

I) [Design the interaction when awake](#part-i)

The tools from earlier versions of this lab (MobileNet, Teachable Machine, Moondream, audio analysis, classic OpenCV) live in the [legacy folder](legacy/README.md). They are optional, but any of them can be the sensor in your Part 2 system.

# Part 1

## Part A. 

\*\*\***Include a screenshot of `ollama list` showing your models.**\*\*\*

<img width="602" height="110" alt="Screenshot 2026-10-25 at 5 18 18 PM" src="https://github.com/user-attachments/assets/eb80cd1a-2e79-4ba3-b56e-e0934481163c" />


## Part B. 
### See: recognize people in real time with YOLO

\*\*\***Include a short video or screenshots of your experiments with the person detection. Write down three situations where it did not see you, or saw a person who was not there, and what you think the cause was.**\*\*\*
https://drive.google.com/file/d/1QjaTfXu2doeILoH-bV_uDEk6hVRbP9bj/view?usp=drive_link

## Part C. 
### See more: hands and pose with MediaPipe

\*\*\***Include a screenshot or short video of the hand pose demo, and write how you might use face, hand or body pose tracking in your observant system.**\*\*\*

<img width="1680" height="1050" alt="Screenshot 2026-10-25 at 7 04 19 PM" src="https://github.com/user-attachments/assets/b2e5adaa-4b81-425e-99d4-8b2c608a4fcf" />
<img width="1680" height="1050" alt="Screenshot 2026-10-25 at 7 04 38 PM" src="https://github.com/user-attachments/assets/cbb9f43d-aa29-4c45-8dee-fb336ecc93e3" />


video: https://drive.google.com/file/d/1GjwYZ4l_DMrZrlUOkL9FgXhslA9-UniY/view?usp=drive_link 


## Part D. 
### Reason: run Qwen on the Pi with Ollama

\*\*\***Ask Qwen three questions to answer. Paste the questions, the answers and how long each took. Try one of them with `qwen3:0.6b` and compare.**\*\*\*

<img width="1680" height="1050" alt="Screenshot 2026-10-25 at 7 12 43 PM" src="https://github.com/user-attachments/assets/d5015b02-a219-40bd-a0de-6df22f5d150b" />
<img width="1680" height="1050" alt="Screenshot 2026-10-25 at 7 09 13 PM" src="https://github.com/user-attachments/assets/7d2bfc92-6d02-4f05-9bf6-c1d0c7615cc5" />



## Part E. 
### Connect: from YOLO readings to Qwen reasoning

<img width="1680" height="1050" alt="Screenshot 2026-10-25 at 7 18 13 PM" src="https://github.com/user-attachments/assets/3cefa950-e5f7-454c-9e50-9b31ff16db67" />


---

# Lab 5 Part 2: Overnight Sensation

For Part 2, you will use the observant system from Part 1 to design a night-time interaction. On-device AI is slow, so let it work while you sleep. The person meets the device twice: **before bed**, when they hand the night over, and **when awake**, when the device gives something back. In between, the pipeline from Part E runs on its own.

Two flavors, pick one or mix them:

* **Sense all night.** The Pi watches, listens or measures from bedtime until morning and keeps a log.
* **Process all night.** You already have the data (a day of phone photos, a long recording) and the Pi needs hours to get through it.

Two house rules. Sample rather than stream: one look every 5 to 30 seconds is plenty, and it keeps the Pi cool. And keep everything on the Pi: tell the people you live with, point the camera at things rather than at beds, and delete the snapshots after the demo.

## Part F. 
### Read Part 2 and storyboard your night-time interaction

Storyboard a night-time interaction built on your observant system, in three panels:

1. **Before bed.** How does the person hand the night over, and how does the device acknowledge it?
2. **While asleep.** What does the device watch or work through?
3. **When awake.** What is the one thing the person learns, and in what medium?

Stuck? A kitchen that tells you who raided the fridge. A desk that reports whether you actually went to bed. A window that names the quietest hour. A plant that describes its night. Find something better.

Use storyboards and/or [Verplank diagrams](https://ccrma.stanford.edu/courses/250a-fall-2004/IDSketchbok.pdf).

\*\*\***Insert ideas, sketches, Verplank diagrams and storyboards for your night-time interaction here.**\*\*\*

https://github.com/anihadagali7/Interactive-Lab-Hub/blob/lab5part2/Lab%205/storyboard.pdf

## Prep for Part 2

1. Look at and give feedback on the Part F storyboards.
   **Put the feedback for your ideas here.**
2. [Update your Lab Hub](prep.md#get-the-latest-content) to get the latest content for Part 2.
3. Decide where the device will spend the night and who else lives there. Get their OK before the first run.
4. Revise your storyboard with the feedback and with what you learned in Part E about where the pipeline breaks.

\*\*\***Post your revised storyboard here.**\*\*\*
https://github.com/anihadagali7/Interactive-Lab-Hub/blob/lab5part2/Lab%205/Lab%205%20part%202f%20revised.pdf

## Part G. 
### Design the interaction before

The hand-off: the person tells the device what to watch tonight, and the device acknowledges it. Keep it to a thirty-second ritual. A button or a touch (Lab 4), a spoken sentence (Lab 3), a wave or a Quiet Coyote at the camera (Part C). The acknowledgement can be a line on the display, a tone, or an LED that dims rather than lights up. At its simplest, the hand-off just sets the question that the morning will answer.

\*\*\***Describe the interaction before.**\*\*\*
Before we go and sleep for the night, we need to make sure we upload all of the photos into the portal. Once that is completed and saved, Qwen will go through and caption each photo. It is very important for users to make sure to approve the captions, as that is a necessary piece before Qwen begins to create a story through the captions.

## Part H. 
### Incorporate the observant system

\*\*\***Screenshots or videos of the running system.**\*\*\*

You can see in the logs that the picture got uploaded, and the log of Qwen coming up with a caption in 126 seconds. 2 mins approx per picture over 15 pictures is a long time.

<img width="1680" height="1050" alt="Screenshot 2026-10-30 at 5 38 37 PM" src="https://github.com/user-attachments/assets/a93d3638-0039-405d-8cea-ce96ea552a64" />


## Part I. 
### Design the interaction after

Here is the final story and lyrics it generated:
<img width="1680" height="1050" alt="Screenshot 2026-11-01 at 9 56 35 AM" src="https://github.com/user-attachments/assets/7e6ae7e6-ff31-47e6-9860-044cc2823c4e" />


## Final documentation

Document all the prototypes and iterations you have designed and worked on. The deliverables for this lab are writings, sketches, photos, and videos that show what your system:

* "Looks like": how the device sits in the room at night, and what it looks like at bedtime and in the morning.
* "Works like": the pipeline from detector to interpreter to log to reasoner, with a real night's data.
* "Acts like": how a person hands the night over and what they get back.

\*\*\***Include a short video of the whole system**\*\*\*

1. Screen to upload photos
  <img width="590" height="1278" alt="IMG_6575" src="https://github.com/user-attachments/assets/eb735100-dec6-4da9-99d2-fec388ba62dc" />

2. Once photos are uploaded, Qwen starts to caption each picture
   <img width="590" height="1278" alt="IMG_6576" src="https://github.com/user-attachments/assets/d724b5b7-f459-487b-a0dd-ccce002d1140" />

3. Qwen has come up with captions for each picture, and user has to approve and save. User can also force Qwen to redo the caption
   <img width="590" height="1278" alt="IMG_6578" src="https://github.com/user-attachments/assets/cb787318-2d5a-49c9-b47b-d2a3f5d9349e" />

4. Once all photos are captioned and approved, user can ask Qwen to write a story
   <img width="590" height="1278" alt="IMG_6579" src="https://github.com/user-attachments/assets/d69fd1ec-a2d1-4fac-96f9-5964bd66037c" />

5. After the story is written and approved, it can be converted to a song using Qwen
   <img width="590" height="1278" alt="IMG_6580" src="https://github.com/user-attachments/assets/3a7ff10b-5be1-4523-afc6-2892801e7392" />

   <img width="1680" height="1050" alt="Screenshot 2026-11-01 at 9 56 35 AM" src="https://github.com/user-attachments/assets/78182df5-641c-44ca-92f1-41463913fae3" />



 




