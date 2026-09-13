const fs = require('fs');

function replaceFile(path, replacer) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content);
    console.log("Patched", path);
}

replaceFile('src/components/Lobby.jsx', (file) => {
    if (!file.includes('useDialog')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useToast } from './ToastProvider';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const dialog = useDialog();')) {
        file = file.replace(/(const { joinCampaign } = useNewCampaign\(\);)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
    }
    
    file = file.replace(/alert\("Failed to update realm details\."\);/g, 'toast("Failed to update realm details.", "error");');
    file = file.replace(/alert\("Profile updated successfully!"\);/g, 'toast("Profile updated successfully!", "success");');
    file = file.replace(/alert\("Failed to update profile\."\);/g, 'toast("Failed to update profile.", "error");');
    file = file.replace(/alert\("This invite link is invalid or has been reset by the Dungeon Master\."\);/g, 'dialog.alert("This invite link is invalid or has been reset by the Dungeon Master.");');
    
    file = file.replace(/alert\(recoveredCount > 0 \? `Successfully recovered \$\{recoveredCount\} missing realm\(s\)!` : "No missing realms found to recover\."\);/g, 'toast(recoveredCount > 0 ? `Successfully recovered ${recoveredCount} missing realm(s)!` : "No missing realms found to recover.", "info");');
    file = file.replace(/alert\("An error occurred while scanning for lost realms\."\);/g, 'toast("An error occurred while scanning for lost realms.", "error");');
    
    file = file.replace(/\} catch \(e\) \{ alert\("Login Error: " \+ e\.message\); setIsLoggingIn\(false\); \}/g, '} catch (e) { dialog.alert("Login Error: " + e.message); setIsLoggingIn(false); }');
    file = file.replace(/alert\("You must be logged in to Forge a new Realm\."\);/g, 'dialog.alert("You must be logged in to Forge a new Realm.");');
    file = file.replace(/alert\("Your request to join was denied by the Dungeon Master\."\);/g, 'dialog.alert("Your request to join was denied by the Dungeon Master.");');
    file = file.replace(/alert\("Failed to accept invite\."\);/g, 'toast("Failed to accept invite.", "error");');

    // Confirms
    // Line 630: `if (!confirm(`Decline invite to ${invite.name}?`)) return;`
    // Ensure `const handleDeclineInvite = async (inviteId, invite) => {`
    file = file.replace(/const handleDeclineInvite = \(inviteId, invite\) => \{/, 'const handleDeclineInvite = async (inviteId, invite) => {');
    file = file.replace(/if \(!confirm\(`Decline invite to \$\{invite\.name\}\?`\)\) return;/g, 'if (!(await dialog.confirm(`Decline invite to ${invite.name}?`))) return;');
    
    // Line 648: `if (confirm(confirmMessage)) {` inside `handleClearRecents`
    file = file.replace(/const handleClearRecents = \(\) => \{/, 'const handleClearRecents = async () => {');
    file = file.replace(/if \(confirm\(confirmMessage\)\) \{/g, 'if (await dialog.confirm(confirmMessage)) {');
    
    // Line 1012: `if(confirm("Delete this character?")) {` inside onClick
    file = file.replace(/onClick=\{\(\) => \{(\s*)if\(confirm\("Delete this character\?"\)\) \{/g, 'onClick={async () => {$1if(await dialog.confirm("Delete this character?")) {');

    return file;
});
