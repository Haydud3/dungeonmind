const fs = require('fs');

function replaceFile(path, replacer) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content);
    console.log("Patched", path);
}

replaceFile('src/components/ModuleHub.jsx', (file) => {
    if (!file.includes('useDialog')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const dialog = useDialog();')) {
        file = file.replace(/(const \[view, setView\] = useState\('generator'\);)/, "$1\n    const dialog = useDialog();");
    }
    
    // Line 103: `if (!confirm(msg)) return;`
    // Ensure parent is async:
    file = file.replace(/const generateEntities = \(type, template, prompt, num = 3\) => \{/, 'const generateEntities = async (type, template, prompt, num = 3) => {');
    file = file.replace(/if \(!confirm\(msg\)\) return;/g, 'if (!(await dialog.confirm(msg))) return;');

    // Line 302: `if (!promptText.trim() && (!loreChunks || loreChunks.length === 0)) return alert("Enter a prompt or upload a PDF to the Archives.");`
    file = file.replace(/return alert\("Enter a prompt or upload a PDF to the Archives\."\);/g, 'return dialog.alert("Enter a prompt or upload a PDF to the Archives.");');

    // Line 370: alert("Failed to generate...")
    file = file.replace(/alert\("Failed to generate campaign skeleton\. See console\."\);/g, 'dialog.alert("Failed to generate campaign skeleton. See console.");');
    
    // Line 393: `if(confirm("Are you sure you want to delete the current module skeleton?")) {`
    // Ensure `const handleDeleteSkeleton = () => {` is async
    file = file.replace(/const handleDeleteSkeleton = \(\) => \{/, 'const handleDeleteSkeleton = async () => {');
    file = file.replace(/if\(confirm\("Are you sure you want to delete the current module skeleton\?"\)\) \{/g, 'if(await dialog.confirm("Are you sure you want to delete the current module skeleton?")) {');

    // Line 483: `const newTitle = prompt("Enter new campaign title:", skeleton.title);`
    file = file.replace(/const newTitle = prompt\("Enter new campaign title:", skeleton\.title\);/g, 'const newTitle = await dialog.prompt("Enter new campaign title:", skeleton.title);');
    // Ensure onClick is async:
    file = file.replace(/onClick=\{\(\) => \{(\s*)const newTitle = await dialog\.prompt/g, 'onClick={async () => {$1const newTitle = await dialog.prompt');

    return file;
});
