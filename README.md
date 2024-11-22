command line tool that recursively solves a complex problem.

# Usage
```sh
# React to Vue
cd examples/react
agentica "convert to vue" -i "**/*.jsx"
agentica "convert to vue3 using script setup" -i "**/*.jsx" -o src/

# Vue to react
cd examples/vue
agentica "convert to react" -i "**/*.vue" -d ## dryrun
agentica "convert to react" -i "**/*.vue"
agentica "convert to react" -i "**/*.vue" -o src/
```

