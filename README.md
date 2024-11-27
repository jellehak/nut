command line tool that recursively solves a complex problem.

# Usage
```sh
# React to Vue
cd examples/react
agentica do "convert to vue" -i "**/*.jsx"
agentica do "convert to vue3 using script setup" -i "**/*.jsx" -o src/

# Vue to react
cd examples/vue
agentica do "convert to react" -i "**/*.vue" -d ## dryrun
agentica do "convert to react" -i "**/*.vue"
agentica do "convert to react" -i "**/*.vue" -o src/

# Directory
agentica do "convert to vue3 using script setup." -i "**/*.jsx" -o out/

# Model
agentica do "convert to vue3 using script setup." -i "src/**/*.jsx" -o out/ -m llama3.1

```

