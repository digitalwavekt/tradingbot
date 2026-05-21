import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  {
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts']
  }
];

export default config;
