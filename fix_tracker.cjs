const fs = require('fs');

function replaceFile(path, replacer) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content);
    console.log("Patched", path);
}

replaceFile('src/components/ui/CombatTrackerSidebar.jsx', (file) => {
    if (!file.includes('useDialog')) {
        file = file.replace(/import \{ createPortal \} from 'react-dom';/, "import { createPortal } from 'react-dom';\nimport { useDialog } from '../DialogProvider';\nimport { useToast } from '../ToastProvider';");
    }
    if (!file.includes('const dialog = useDialog();')) {
        file = file.replace(/(const \[showAddModal, setShowAddModal\] = useState\(false\);)/, "$1\n    const dialog = useDialog();\n    const toast = useToast();");
    }

    file = file.replace(/const handleEnd = \(\) => \{/, 'const handleEnd = async () => {');
    file = file.replace(/if \(window\.confirm\("End combat and clear initiative tracker\?"\)\) \{/, 'if (await dialog.confirm("End combat and clear initiative tracker?")) {');

    file = file.replace(/const editInit = \(tokenId, currentInit\) => \{/, 'const editInit = async (tokenId, currentInit) => {');
    file = file.replace(/const newVal = window\.prompt\("Set new initiative:", currentInit\);/, 'const newVal = await dialog.prompt("Set new initiative:", currentInit);');

    return file;
});
