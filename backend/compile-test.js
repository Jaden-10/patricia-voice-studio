const { spawn } = require('child_process');
const path = require('path');

console.log('Testing TypeScript compilation...');

const tscProcess = spawn('npx', ['tsc', '--noEmit'], {
  cwd: __dirname,
  stdio: 'inherit'
});

tscProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ TypeScript compilation successful');
    process.exit(0);
  } else {
    console.log('❌ TypeScript compilation failed');
    process.exit(1);
  }
});

tscProcess.on('error', (err) => {
  console.error('Error running TypeScript compiler:', err);
  process.exit(1);
});