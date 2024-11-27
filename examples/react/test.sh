#! /bin/sh
# agentica "convert to vue3 using script setup." -i "src/**/*.jsx" -o out/
# agentica "split up the files so it contain one component per file." -i "src/MultiComponent.jsx" -o out/ -m llama3.1 -p -l log.md

# Model testing
agentica "split up the files so it contain one component per file." -i "src/MultiComponent.jsx" -o build/llama3.1/ -m llama3.1 -p -l build/llama3.1/log.md
agentica "split up the files so it contain one component per file." -i "src/MultiComponent.jsx" -o build/mistral-nemo/ -m mistral-nemo -p -l build/mistral-nemo/log.md
agentica "split up the files so it contain one component per file." -i "src/MultiComponent.jsx" -o build/phi3/ -m phi3 -p -l build/phi3/log.md
agentica "split up the files so it contain one component per file." -i "src/MultiComponent.jsx" -o build/llama3.2/ -m llama3.2 -p -l build/llama3.2/log.md

 