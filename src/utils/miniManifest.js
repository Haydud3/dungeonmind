let cachedTree = null;

export const fetchGithubMinis = async () => {
    if (cachedTree) return cachedTree;
    try {
        let res = await fetch('https://api.github.com/repos/theripper93/canvas3dtokencompendium/git/trees/master?recursive=1');
        if (!res.ok) res = await fetch('https://api.github.com/repos/theripper93/canvas3dtokencompendium/git/trees/main?recursive=1');
        const data = await res.json();
        const branch = res.url.includes('/master') ? 'master' : 'main';
        
        cachedTree = data.tree
            .filter(node => node.path.endsWith('.glb'))
            .map(node => {
                const name = node.path.split('/').pop().replace('.glb', '');
                const encodedPath = node.path.split('/').map(encodeURIComponent).join('/');
                return {
                    id: node.sha,
                    name: decodeURIComponent(name),
                    url: `https://raw.githubusercontent.com/theripper93/canvas3dtokencompendium/${branch}/${encodedPath}`,
                    thumb: "",
                    scale: 1.0,
                    yOffset: 0
                };
            });
        return cachedTree;
    } catch (e) {
        console.error("Failed to fetch minis from GitHub", e);
        return [];
    }
};

export const searchGithubModels = async (query) => {
    const all = await fetchGithubMinis();
    if (!query) return all.slice(0, 30);
    
    const q = query.toLowerCase();
    const matches = all.filter(m => m.name.toLowerCase().includes(q));
    
    matches.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (aName === q) return -1;
        if (bName === q) return 1;
        if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
        if (!aName.startsWith(q) && bName.startsWith(q)) return 1;
        return aName.length - bName.length;
    });
    
    return matches.slice(0, 50);
};

export const getModelsForCreature = (name, type) => {
    return [];
};