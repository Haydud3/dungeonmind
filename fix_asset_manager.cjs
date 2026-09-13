const fs = require('fs');

function replaceFile(path, replacer) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content);
    console.log("Patched", path);
}

replaceFile('src/components/AssetManager.jsx', (file) => {
    if (!file.includes('useDialog')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useToast } from './ToastProvider';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const dialog = useDialog();')) {
        file = file.replace(/(const \[filter, setFilter\] = useState\('all'\);)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
    }

    file = file.replace(/alert\("Processing failed\."\);/g, 'toast("Processing failed.", "error");');
    file = file.replace(/alert\("Upload failed\."\);/g, 'toast("Upload failed.", "error");');
    file = file.replace(/alert\("Delete failed\."\);/g, 'toast("Delete failed.", "error");');
    file = file.replace(/alert\("Failed to delete asset\."\);/g, 'toast("Failed to delete asset.", "error");');
    file = file.replace(/alert\("Please set a map background first\."\);/g, 'dialog.alert("Please set a map background first.");');
    file = file.replace(/alert\("Could not load image\. Cross-Origin Resource Sharing \(CORS\) might be preventing it\."\);/g, 'dialog.alert("Could not load image. Cross-Origin Resource Sharing (CORS) might be preventing it.");');
    file = file.replace(/alert\("Failed to export preset\."\);/g, 'toast("Failed to export preset.", "error");');
    file = file.replace(/alert\("This preset was exported incorrectly and is missing its background image data\. Please re-export the preset\."\);/g, 'dialog.alert("This preset was exported incorrectly and is missing its background image data. Please re-export the preset.");');
    file = file.replace(/alert\("Failed to import preset\. Make sure it's a valid DungeonMind preset JSON file\."\);/g, 'dialog.alert("Failed to import preset. Make sure it\'s a valid DungeonMind preset JSON file.");');
    file = file.replace(/alert\("Failed to rename asset\."\);/g, 'toast("Failed to rename asset.", "error");');

    // handleDeleteCharacter (Line 484)
    file = file.replace(/const handleDeleteCharacter = \(char\) => \{/, 'const handleDeleteCharacter = async (char) => {');
    file = file.replace(/if \(!confirm\(`Permanently remove "\$\{char\.name\}" from the campaign\?`\)\) return;/g, 'if (!(await dialog.confirm(`Permanently remove "${char.name}" from the campaign?`))) return;');
    
    // handleDeleteAsset (Line 498)
    file = file.replace(/const handleDeleteAsset = \(asset\) => \{/, 'const handleDeleteAsset = async (asset) => {');
    file = file.replace(/if \(!confirm\(`Permanently delete "\$\{asset\.name\}"\?`\)\) return;/g, 'if (!(await dialog.confirm(`Permanently delete "${asset.name}"?`))) return;');

    // Rename map (Line 1417)
    file = file.replace(/onClick=\{\(\) => \{(\s*)const newName = prompt\("Enter new name for map:", map\.name\);/g, 'onClick={async () => {$1const newName = await dialog.prompt("Enter new name for map:", map.name);');
    
    // Missing Map Remove (Line 1455)
    file = file.replace(/onClick=\{\(\) => \{(\s*)if \(confirm\(`Remove "\$\{map\.name\}" and mark as missing\?`\)\) \{/g, 'onClick={async () => {$1if (await dialog.confirm(`Remove "${map.name}" and mark as missing?`)) {');

    // Rename asset (Line 1617)
    file = file.replace(/onClick=\{\(\) => \{(\s*)const newName = prompt\("Enter new name for asset:", asset\.name\);/g, 'onClick={async () => {$1const newName = await dialog.prompt("Enter new name for asset:", asset.name);');

    // Reset FOW (Line 2076)
    file = file.replace(/onClick=\{\(\) => \{(\s*)if \(window\.confirm\("Are you sure you want to reset the Fog of War\? All explored areas will be hidden again\."\)\) \{/g, 'onClick={async () => {$1if (await dialog.confirm("Are you sure you want to reset the Fog of War? All explored areas will be hidden again.")) {');

    return file;
});
