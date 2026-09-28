# Audio credits

The Korean narration in `frontend/public/audio/narration/` is **synthetic speech**, generated for this game. It is not a recording of a cast member or a voice taken from another game or television show.

- **Speech model:** [Pocket-TTS Korean 100M by seastar105](https://huggingface.co/seastar105/pocket-tts-korean-100m), based on [Kyutai Pocket TTS](https://github.com/kyutai-labs/pocket-tts). Model weights: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution: seastar105 and Kyutai. The model was used to synthesize the game's original Korean lines; the resulting audio was compressed to MP3. During playback it is lowered slightly and given a game-show host treatment (EQ, light saturation, a faint ring-modulated layer, chorus and a short slap echo) by Web Audio in `frontend/src/hooks/useGameAudio.ts`.
- **Regenerating lines:** `python scripts/generate-narration.py briefing` synthesizes the rule-briefing lines in `frontend/src/data/briefing.json` with the same model and voice prompt.
- **Male voice prompt:** `voice-zero/bill_boerst.wav` from [Kyutai TTS Voices](https://huggingface.co/kyutai/tts-voices/blob/main/README.md). The Voice-Zero recordings in that collection are listed as [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Background score and effects:** original Web Audio synthesis in `frontend/src/hooks/useGameAudio.ts`. No music or sound recordings from another game are included.

Built-in topics and phase lines use the generated local files. If a line has no file or loading fails, the browser's Korean speech synthesis is used; its voice depends on the browser and device.
