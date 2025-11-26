import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'app_data');
const targetDir = path.join(projectRoot, 'docs', 'demo-data');

async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function main() {
    try {
        const stats = await fs.stat(sourceDir);
        if (!stats.isDirectory()) {
            console.warn(`Source directory ${sourceDir} does not exist. Skipping copy.`);
            return;
        }

        console.log(`Copying demo data from ${sourceDir} to ${targetDir}...`);
        await copyDir(sourceDir, targetDir);
        console.log('Demo data copied successfully.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Source directory ${sourceDir} does not exist. Skipping copy.`);
        } else {
            console.error('Error copying demo data:', error);
            process.exitCode = 1;
        }
    }
}

main();
