command line tool that recursively solves a complex problem.

# Usage
```sh
# React to Vue
cd examples/react
nut do "convert to vue" -i "**/*.jsx"
nut do "convert to vue3 using script setup" -i "**/*.jsx" -o src/

# Vue to react
cd examples/vue
nut do "convert to react" -i "**/*.vue" -d ## dryrun
nut do "convert to react" -i "**/*.vue"
nut do "convert to react" -i "**/*.vue" -o src/

# Directory
nut do "convert to vue3 using script setup." -i "**/*.jsx" -o out/

# Model
nut do "convert to vue3 using script setup." -i "src/**/*.jsx" -o out/ -m llama3.1

```

