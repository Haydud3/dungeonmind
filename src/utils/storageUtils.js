import { db, storage } from '../firebase';
import { collection, addDoc, doc, setDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Upload a Blob/File to Firebase Storage and return the public URL
export const uploadImage = async (blob, path) => {
    if (!storage) throw new Error("Firebase Storage not initialized");
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
};

// Convert an <img> element (from Puter.js) to a Blob for uploading
export const imageElementToBlob = async (imgElement) => {
    return new Promise((resolve, reject) => {
        if (imgElement.src.startsWith('blob:')) {
            fetch(imgElement.src).then(r => r.blob()).then(resolve).catch(reject);
        } else {
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth || 2048;
            canvas.height = imgElement.naturalHeight || 2048; 
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
        }
    });
};

// Phase 1: Store Base64 in chunks to bypass Firestore document size limits
export const storeChunkedMap = async (base64, name) => {
    const CHUNK_SIZE = 900000;
    const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
    
    const metaRef = await addDoc(collection(db, "map_metadata"), {
        name,
        totalChunks,
        createdAt: serverTimestamp()
    });

    for (let i = 0; i < totalChunks; i++) {
        const chunk = base64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await setDoc(doc(db, "map_metadata", metaRef.id, "chunks", i.toString()), {
            data: chunk,
            index: i
        });
    }

    return `chunked:${metaRef.id}`;
};

// Phase 3: Store both Full and LOD assets
export const storeMapWithThumbnail = async (fullBase64, thumbBase64, name) => {
    const fullId = await storeChunkedMap(fullBase64, name);
    const thumbId = await storeChunkedMap(thumbBase64, `${name}_thumb`);
    
    // Update metadata of the full image to link to its thumbnail
    const docId = fullId.replace('chunked:', '');
    await setDoc(doc(db, "map_metadata", docId), {
        thumbnailId: thumbId,
        isMultiTier: true
    }, { merge: true });

    return { fullId, thumbId };
};

// Phase 2: Retrieve and assemble chunks directly into a Blob
export const retrieveChunkedMap = async (chunkedId, signal) => {
    if (!chunkedId) return null;
    console.log(`[Storage] Retrieving ${chunkedId}...`);
    const startTime = performance.now();

    const docId = chunkedId.replace('chunked:', '').trim().replace(/['"]/g, '');
    const chunksRef = collection(db, "map_metadata", docId, "chunks");
    const q = query(chunksRef, orderBy("index", "asc"));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return null;

    const byteArrays = [];
    let mimeType = 'image/webp'; 
    const docs = snapshot.docs;
    const totalDocs = docs.length;
    let remainder = ''; // Buffer for incomplete base64 sequences
    let lastYieldTime = performance.now();

    // 2. Process chunks iteratively with yielding (CPU intensive)
    for (let i = 0; i < totalDocs; i++) {
        // ABORT CHECK: Stop processing if the component unmounted
        if (signal?.aborted) {
            console.log(`[Storage] Aborted retrieval of ${chunkedId}`);
            throw new DOMException('Aborted', 'AbortError');
        }

        let chunkData = docs[i].data().data;
        
        // Handle Data URI header if present in the first chunk
        if (i === 0) {
            const headerEnd = chunkData.indexOf(',');
            if (headerEnd !== -1 && chunkData.startsWith('data:')) {
                const header = chunkData.substring(0, headerEnd);
                const match = header.match(/data:(.*);base64/);
                if (match) mimeType = match[1];
                chunkData = chunkData.substring(headerEnd + 1);
            }
        }

        // SANITIZATION: Strip any accidental whitespace/newlines that might break atob
        chunkData = chunkData.replace(/[\n\r\s]/g, '');

        // Combine with remainder from previous chunk to ensure valid base64 length (multiple of 4)
        const combinedData = remainder + chunkData;
        const validLength = combinedData.length - (combinedData.length % 4);
        const chunkToDecode = combinedData.substring(0, validLength);
        remainder = combinedData.substring(validLength);

        if (chunkToDecode.length > 0) {
            try {
                const binaryStr = atob(chunkToDecode);
                const len = binaryStr.length;
                const bytes = new Uint8Array(len);
                for (let j = 0; j < len; j++) {
                    bytes[j] = binaryStr.charCodeAt(j);
                }
                byteArrays.push(bytes);
            } catch (e) {
                console.error(`[Storage] Chunk ${i} decode failed:`, e);
            }
        }
        
        // MEMORY OPTIMIZATION: Explicitly free the large string to help GC
        chunkData = null;

        // Yield to main thread based on time budget (12ms) to maintain 60fps
        // This adapts to mobile (slower CPU) vs desktop (faster CPU) automatically
        if (performance.now() - lastYieldTime > 12) {
            await new Promise(resolve => setTimeout(resolve, 0));
            lastYieldTime = performance.now();
        }
    }

    const blob = new Blob(byteArrays, { type: mimeType });
    console.log(`[Storage] Assembled ${chunkedId} in ${(performance.now() - startTime).toFixed(2)}ms. Size: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
    return blob;
};

// Phase 3: Resolve all chunked references in an HTML string with Diagnostics
export const resolveChunkedHtml = async (html) => {
    if (!html || !html.trim()) return html || "";
    console.group("Handout Resolution Diagnostic");
    try {
        const regex = /chunked:[a-zA-Z0-9_-]+/g;
        const matches = html.match(regex);
        
        if (!matches || matches.length === 0) {
            console.groupEnd();
            return html;
        }

        const uniqueIds = [...new Set(matches)];
        const resolutions = await Promise.all(uniqueIds.map(async (id) => {
            try {
                const blob = await retrieveChunkedMap(id);
                const url = URL.createObjectURL(blob);
                return { id, url };
            } catch (e) {
                console.error(`FAILED to reassemble ${id}:`, e);
                return { id, url: "" };
            }
        }));

        let resolvedHtml = html;
        resolutions.forEach(({ id, url }) => {
            if (url) {
                resolvedHtml = resolvedHtml.split(id).join(url);
            }
        });
        console.groupEnd();
        return resolvedHtml;
    } catch (err) {
        console.error("Critical error in resolveChunkedHtml:", err);
        console.groupEnd();
        return html;
    }
};

// Phase 4: Parse HTML into blocks for stream rendering
export const parseHandoutBody = (html) => {
    if (!html) return [];
    // Identify <img> tags containing chunked references
    const regex = /(<img[^>]*src=["']chunked:[^"']*["'][^>]*>)/g;
    const parts = html.split(regex);
    
    return parts.map(part => {
        const match = part.match(/src=["'](chunked:[a-zA-Z0-9_-]+)["']/);
        if (match) {
            return { type: 'image', id: match[1] };
        }
        return { type: 'text', content: part };
    }).filter(part => part.type === 'image' || (part.type === 'text' && part.content.trim()));
};