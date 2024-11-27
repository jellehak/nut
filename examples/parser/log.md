Here are the files split up so that each file contains one component:

**App.jsx**
```jsx
import React from 'react';

const App = () => {
  return (
    <div>
      <NiceHeading>Hello, world!</NiceHeading>
    </div>
  );
};

export default App;
```

**NiceHeading.jsx**
```jsx
import React from 'react';

const NiceHeading = (children = []) => {
  return (
    <h1>{children}</h1>
  );
};

export default NiceHeading;
```