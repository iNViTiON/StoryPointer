const fs = require("fs");
const path = require("path");
const { mergeHTMLReports } = require("@nil1511/playwright-merge-html-reports");

const reportPathsToMerge = fs
  .readdirSync(process.cwd() + "/playwright-report", { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map(({ name }) => path.resolve(process.cwd() + "/playwright-report", name));

mergeHTMLReports(reportPathsToMerge, {
  outputFolderName: "html-report",
});
