const fs = require("fs-extra");
const path = require("path");

const sourceDir = path.resolve(__dirname, "../Paws.DotNet/Paws.Host/bin/Debug/net8.0");
const targetDir = path.resolve(__dirname, "resources/Paws.Backend");

fs.emptyDirSync(targetDir);

try {
	fs.copySync(sourceDir, targetDir, {
		dereference: true,
		filter: (src, dest) => {
			return true;
		}
	});
	console.log("Successfully copied C# backend to resources directory.");
} catch (err) {
	console.error("Error copying C# backend:", err);
	process.exit(1);
}
