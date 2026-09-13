const fs = require('fs');

function replaceFile(path, replacer) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content);
    console.log("Patched", path);
}

replaceFile('src/components/TacticalMapView.jsx', (file) => {
    if (!file.includes('const toast = useToast();')) {
        file = file.replace(/(const dialog = useDialog\(\);)/, "$1\n    const toast = useToast();");
    }
    if (!file.includes('useToast')) {
        file = file.replace(/import \{ useDialog \} from '\.\/DialogProvider';/, "import { useDialog } from './DialogProvider';\nimport { useToast } from './ToastProvider';");
    }

    file = file.replace(/alert\("No monsters found in the SRD with that name\."\);/g, 'toast("No monsters found in the SRD with that name.", "error");');
    file = file.replace(/alert\("Could not connect to D&D 5e API\."\);/g, 'toast("Could not connect to D&D 5e API.", "error");');
    file = file.replace(/alert\("The Forge failed\."\);/g, 'toast("The Forge failed.", "error");');
    file = file.replace(/alert\("The Forge encountered an error: " \+ e\.message\);/g, 'toast("The Forge encountered an error: " + e.message, "error");');
    file = file.replace(/alert\("Failed to parse text\. Make sure it's a valid 5e statblock\."\);/g, 'toast("Failed to parse text. Make sure it\'s a valid 5e statblock.", "error");');
    file = file.replace(/alert\("Failed to import monster details\."\);/g, 'toast("Failed to import monster details.", "error");');
    file = file.replace(/alert\("No image available to forge a 3D mini\."\);/g, 'toast("No image available to forge a 3D mini.", "error");');
    file = file.replace(/alert\("3D Forge Failed: " \+ e\.message\);/g, 'toast("3D Forge Failed: " + e.message, "error");');

    // handleNewBlankMap
    file = file.replace(/const handleNewBlankMap = \(\) => \{/, 'const handleNewBlankMap = async () => {');
    file = file.replace(/if \(!window\.confirm\("Create a new blank map\? This will navigate away from the current map\."\)\) return;/g, 'if (!(await dialog.confirm("Create a new blank map? This will navigate away from the current map."))) return;');

    // clear-drawings
    file = file.replace(/onClick=\{\(\) => \{ if \(window\.confirm\("Clear all map drawings\?"\)\)/g, 'onClick={async () => { if (await dialog.confirm("Clear all map drawings?"))');

    // Token context menu rename
    file = file.replace(/label="Rename" onClick=\{\(\) => \{(\s*)const newName = window\.prompt\("Enter new token name:", currentName\);/g, 'label="Rename" onClick={async () => {$1const newName = await dialog.prompt("Enter new token name:", currentName);');

    // Lore pin delete
    file = file.replace(/onClick=\{\(\) => \{(\s*)if \(confirm\("Are you sure you want to delete this Lore Pin\?"\)\)/g, 'onClick={async () => {$1if (await dialog.confirm("Are you sure you want to delete this Lore Pin?"))');

    return file;
});
