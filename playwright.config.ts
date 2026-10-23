import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'tests/e2e',timeout:120000,fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:5173',trace:'retain-on-failure'},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:true,timeout:30000},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
    {name:'firefox',use:{...devices['Desktop Firefox'],viewport:{width:1440,height:900}}},
    {name:'webkit',use:{...devices['Desktop Safari'],viewport:{width:1440,height:900}}},
    {name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',viewport:{width:390,height:844}}}
  ]
});
