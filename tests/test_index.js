const assert = require("assert");
const { generateJsonData, writeFilesFromStr } = require("../index.js");

describe("Apptoapp", function () {
  describe("#generateJsonData()", function () {
    it("should generate JSON data from the source directory", function () {
      // Call the function with a test source directory
      const result = generateJsonData("./test-src");
      // Check that the result is as expected
      assert.equal(result, { file1: "content1", file2: "content2" }); // replace with the actual JSON data that corresponds to the files in the "./test-src" directory
    });
  });

  describe("#writeFilesFromStr()", function () {
    it("should write files from a string", function () {
      // Call the function with a test string
      const result = writeFilesFromStr("test string");
      // Check that the result is as expected
      assert.equal(result, "test string"); // replace with the actual file content that corresponds to the "test string"
    });
  });
});
