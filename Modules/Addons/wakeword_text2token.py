import argparse

import sherpa_onnx


def read_keywords(path):
    texts = []
    extra_info = []
    with open(path, "r", encoding="utf8") as f:
        for line in f:
            extra = []
            words = []
            toks = line.strip().split()
            for tok in toks:
                if tok.startswith(":") or tok.startswith("#") or tok.startswith("@"):
                    extra.append(tok)
                else:
                    words.append(tok)
            texts.append(" ".join(words))
            extra_info.append(extra)
    return texts, extra_info


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--tokens", required=True)
    parser.add_argument("--tokens-type", required=True)
    parser.add_argument("--bpe-model", default=None)
    parser.add_argument("--lexicon", default=None)
    args = parser.parse_args()

    texts, extra_info = read_keywords(args.input)
    encoded_texts = sherpa_onnx.text2token(
        texts,
        tokens=args.tokens,
        tokens_type=args.tokens_type,
        bpe_model=args.bpe_model,
        lexicon=args.lexicon,
    )

    with open(args.output, "w", encoding="utf8") as f:
        for i, txt in enumerate(encoded_texts):
            txt += extra_info[i]
            f.write(" ".join(txt) + "\n")


if __name__ == "__main__":
    main()
