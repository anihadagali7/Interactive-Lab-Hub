# Chatterboxes

**NAMES OF COLLABORATORS HERE**

Ani Hadagali (ah2495)
Jonathan Tumalle (jrt285)

# Part 1

## A. Text to Speech


Answer: I used three different voices for the script. The voices changed in how formal and inviting they sounded. en_US-norman-medium sounds more friendly like an actual greeting. en_GB-vctk-medium sounds very monotone and disinterested. en_GB-southern_english_female-low was just formal and direct.

## B. Speech to Text

The real time factor of the two models I chose:

- small - 1.30x
- tiny - 0.22x

Accuracy improvements stop being worth the delay if the text already captures the words said with tolerance for some grammatical errors. In the example, the output of the small was "Hey, this is Jonathan. I hope you're having a great day." The tiny transcribed the same audio to "Hey this is Jonathan, I hope you're having a great day." This grammar inaccuracy is fine for me as the reader since I can understand the intention still. If this was to be sent to someone else in a more formal setting, then I may prefer the small's output since I would have less tolerance for grammar mistakes.

\*\***Write your own script that verbally asks for a numerical input (a phone number, zipcode, number of pets) and records the answer the respondent provides.**\*\* Numbers are a good stress test — transcription systems make characteristic errors on digit strings, and you will want to know what they are before you design around them.

https://github.com/anihadagali7/Interactive-Lab-Hub/blob/anihadagali7-Aug26-Lab/Lab%203/speech-scripts/transcribe.py

## C. Turn-taking: knowing when someone has stopped talking

Answer: A larger delay makes the system feel like it's trying to actually log what was said and comprehend it, while the smaller delay feels rushed. The smaller delay makes it feel like the model is not understanding, and the text output also showed this behavior. It was as if it was cutting me off like a rude person.

There is no correct value. A system that takes drink orders and a system that listens to someone think out loud want very different thresholds, and the right one depends on what your users are doing with their pauses.

### The complete loop

`echo_bot.py` puts the pieces together: it listens, endpoints, transcribes, and speaks a reply through Piper. The dialogue policy is deliberately trivial — it repeats what you said — so that everything you notice is a property of the timing rather than the content.

```
(.venv) $ python echo_bot.py
```

## D. Storyboard

\*\***Post your storyboard and diagram here.**\*\*

![alt text](image.png)

![alt text](image-1.png)

\*\***Please describe and document your process.**\*\*

WordHound dialogue script
WordHound is a two-player Taboo game in which the device guesses the secret word from one player's spoken clues. The clue-giver sees the card; WordHound must not. Each player gets an 2 minute turn as the clue-giver. A correct guess earns the clue-giver one point and advances to the next card. A wrong guess keeps the same card active so the player can add a clue. The player with the most points after both turns wins.

Example round [AI Assisted in setting up the script]
Word on card (Freddy only): moth
Taboo words: insect, wings, butterfly, light

WordHound: Freddy, your turn. Your 2 minutes start now. Describe the word without saying the word or the words printed on the card.

[Pause for Freddy to begin; allow up to 5 seconds. If no speech is detected, prompt once: "I'm listening for your clue."]

Freddy: It comes out at night and flies around a porch lamp.

[Wait for Freddy to finish. Treat 1.0 second of silence as the end of the clue; if speech resumes before then, keep listening.]

WordHound: Is it a butterfly?

Freddy: No, similar, but it's attracted to light.

[Wait for the end of the reply using the same 1.0-second silence threshold.]

WordHound: Is it a moth?

Freddy: Yes!

WordHound: Correct! Freddy gets one point. Your score is one. Here's the next word.

[Brief 1-second pause while WordHound selects the next card, then continue listening.]

WordHound: Here's your next word.

[Brief 1-second pause for the next card. WordHound listens for Freddy's clue and waits for 1.0 second of silence before guessing.]

Freddy: It flies at night and hangs upside down in a cave.

WordHound: Is it a bat?

Freddy: Yes!

WordHound: Correct! That's two points for Freddy.

[Timer runs out]

WordHound: Your turn is over. [Pause 2 seconds while the device switches players.] Sam, your turn. Your 2 minutes start now. Describe the word on your card without saying the word or the words printed on it.

[Sam looks at the card. WordHound waits up to 5 seconds for Sam to begin; if no speech is detected, it prompts once: "I'm listening for your clue."]

Sam: You use it to unlock a door. It can be metal, and you might keep it on a ring.

[WordHound waits for the clue to end, using 1.0 second of silence.]

WordHound: Is it a key?

Sam: Yes!

WordHound: Correct! Sam gets one point. [Pause 1 second to select the next card.] Here's your next word.

Sam: You wear it on your wrist and it tells you the time.

[WordHound waits for 1.0 second of silence.]

WordHound: Is it a watch?

Sam: Yes!

WordHound: Correct! That's two points. [Pause 1 second to select the next card.] Here's your next word.

Sam: It is a place where you borrow books.

[WordHound waits for 1.0 second of silence.]

WordHound: Is it a library?

Sam: Yes!

WordHound: Correct! That's three points.

[The 2-minute timer ends.]

WordHound: Time! Sam scored three points this turn. This round ends with Freddy at two points and Sam at three.

[Skip ahead through the remaining rounds. WordHound keeps score and alternates turns.]

WordHound: Game over! Freddy finished with eight points, and Sam finished with ten. Sam wins!

## E. Acting out the dialogue

Find a partner, and _without sharing the script with your partner_ try out the dialogue you've designed, where you (as the device designer) act as the device you are designing. Please record this interaction (for example, using Zoom's record feature).

Watch the video here: https://drive.google.com/file/d/1XunK0EcWV18VXaPGtrj4vkQcQwvqhCNR/view?usp=share_link

\*\***Describe if the dialogue seemed different than what you imagined when it was acted out, and how.**

The dialogue was similar to the script, but it was more awkward when we played it out since we both weren't sure when the machine would start/stop talking. We also weren't sure if our audio got picked up by the machine, as there was sometimes a delay in its response.

---

# Lab 3 Part 2

For Part 2, you will redesign the interaction with the speech-enabled device using the data collected, as well as feedback from part 1.

## Prep for Part 2

1. What are concrete things that could use improvement in the design of your device? For example: wording, timing, anticipation of misunderstandings.
2. What are other modes of interaction _beyond speech_ that you might also use to clarify how to interact? In particular: how does someone know when the device is listening, and when it is thinking? You have a screen and an LED.
3. Make a new storyboard, diagram and/or script based on these reflections.
4. (optional) Integrate [input devices](inputs.md) in the system

## WordHound POC: One-Player Word Guessing Game

WordHound is a one-player prototype where he player sees a target word on the screen and describes it aloud while WordHound tries to infer the word. This POC is not a competitive two-player Taboo game: it has no forbidden words, turn-taking between players, timer, or score. The target word remains visible to the player, but it is never sent to the transcription or guessing systems.

The player presses a button to start a clue. After roughly two seconds of silence, WordHound saves the recording,transcribes it locally on the Pi, and asks an AI model to make a guess from the transcript. It shows and speaks the guess. The player then says "yes" to complete the card, or says "no" followed by another clue. A no-with-clue is immediately combined with the earlier clue and guess to make another guess. Once the player confirms a guess, there's a button to advance to the next card.

## Prototype your system

<img width="430" height="746" alt="Screenshot 2026-10-04 at 7 56 00 PM" src="https://github.com/user-attachments/assets/a8ed0f85-d067-4112-beac-7cb733230570" />


## POC components

- Raspberry Pi app and Mini PiTFT: shows the target word to the player, the current listening/processing state, the transcript, and the AI's guess.
- Physical controls: the buttons start a clue (or a replacement clue) or advance to another word after a correct guess.
- USB microphone: captures the clue giver's speech. stops recording after about two seconds of silence and provides audible start/end cues.
- Local speech recognition: faster-whisper transcribes each recorded clue and feedback response on the Pi.
- Codex CLI guesser: receives only clue transcripts and returns a guessed word; it cannot access the target word or card list.
- USB speaker and local speech engine: announce the AI's guess aloud using piper's text-to-speech engine.
- Feedback listener: treats a spoken "yes" as completion, or uses the clue after a spoken "no" for the next guess without another recording turn.

## Test the system

Video of the WordHound test: https://drive.google.com/file/d/1XunK0EcWV18VXaPGtrj4vkQcQwvqhCNR/view?usp=share_link 

Answer the following:

## What worked well about the system and what didn't?

- The system was very good at loading the game, which involved showing the main word, the guessed word, and confirmation screens. It was nice for the player to see that the speech was processed and the system was guessing the word, which gave the player feedback of knowing what is happening. This was something that we had trouble with in Lab 3a, where we weren’t sure if the system had heard or, if the system was working on its response.
- One thing that didn’t work well was the wait time between the player speaking the word and the system displaying the guessed word. This was due to the transcript being sent to Code CLI to guess the word. The waiting for player’s speech to end plus then sending it via API to Codex and waiting for the response, then displaying the guessed word and also speaking the word is the flow that causes the slow response.

## What worked well about the controller and what didn't?

- The microphone controller generally worked well at capturing the player's speech. It allowed players to describe the target word verbally, making the game more interactive and eliminating the need for a keyboard or other text-based input method. The microphone was able to pick up the player's voice during most of our testing, allowing the system to process the spoken input and generate a response.
- The controller also provided a relatively straightforward way for players to interact with the system. Since the primary input was speech, players could focus on describing the target word rather than learning a complicated set of controls.
- However, there was one instance in which the system failed to pick up the player's speech. This showed that microphone input is not always reliable and that the system needs to account for situations in which speech is missed or cannot be transcribed correctly. Possible contributing factors include microphone sensitivity, background noise, the player's distance from the microphone, or the timing of the recording process.

## What lessons can you take away from the WoZ interactions for designing a more autonomous version of the system?

- One of the main lessons from the WoZ interactions is that the system should minimize the amount of manual intervention required from the player. During testing, we have to press the physical button on the screen to progress to the next round. We also had to press another button to start recording listening. We also sometimes we had to press the physical button to reset the game, if the system could not understand the player’s speech input. One thing we can do to make it automatic is to get rid of the need for using buttons. The system can progress to the next round once the word has been guessed correctly. We can have an input screen which allows users to correct the system and tell it that it needs reset or player needs to speak its input again.

## How could you use your system to create a dataset of interaction? What other sensing modalities would make sense to capture?

- We could use the system to collect a dataset of player interactions by logging each round of the WordHunt game. For each interaction, we could record the target word, the player's spoken description, the speech-to-text transcript, the word guessed by the AI, the player's confirmation of whether the guess was correct, and the final outcome of the round. We could also record timestamps for important events, such as when recording begins, when the player finishes speaking, when the transcript is generated, when the AI returns its guess, and when the player confirms the result. This would allow us to measure response latency and identify which parts of the processing pipeline contribute most to delays.
