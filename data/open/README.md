# 可商用词库（预览）

`zh-n2.jsonl`：JLPT N2 单词的中文释义和例句中文翻译，本项目原创，每行对应 OpenJLPT `data/json/vocab/n2.json` 里的一个词（按 `id` 对应）。

由 `tools/build_open.py` 和 OpenJLPT 合并生成根目录的 `words-open.js`，App 里用 `?db=open` 打开。

## 许可

`words-open.js` 和本目录的数据按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 发布。

数据来源：
- [OpenJLPT](https://github.com/evanclan/OpenJLPT)（CC BY-SA 4.0），其中包含：
  - Jonathan Waller 的 JLPT 词表 <https://www.tanos.co.uk/jlpt/>（CC BY）
  - JMdict，EDRDG <https://www.edrdg.org/edrdg/licence.html>（CC BY-SA 4.0）
  - Tatoeba 例句 <https://tatoeba.org>（CC BY 2.0 FR），每句可按 OpenJLPT 中的 `tatoeba_id` 查到原作者
- 中文释义和例句翻译：本项目原创

JLPT 官方不公布词汇表，级别划分是社区整理的近似结果。

## 发音

`audio/n2/` 下的单词（`w/<id>.mp3`）和例句（`e/<id>_<序号>.mp3`）发音由 `tools/tts_voicevox.py` 用 [VOICEVOX](https://voicevox.hiroshiba.jp/) 生成，声音是 **VOICEVOX:冥鳴ひまり**。
按冥鳴ひまり的[使用规定](https://www.meimeihimari.com/terms-of-use)，商用、非商用都可以，使用时必须署名「VOICEVOX:冥鳴ひまり」（App 底部已标注）。
