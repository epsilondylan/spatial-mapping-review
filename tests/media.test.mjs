import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source=await fs.readFile(new URL('../client/media.js',import.meta.url),'utf8');
async function withRoot(root){return import('data:text/javascript;base64,'+Buffer.from(source.replaceAll('import.meta.url',JSON.stringify(root))).toString('base64'))}
test('evidence media resolves at a GitHub Pages project root, including already-prefixed links',async()=>{
 const {assetURL}=await withRoot('https://example.com/spatial-mapping-review/media.js');
 assert.equal(assetURL('/media/image.png'),'https://example.com/spatial-mapping-review/media/image.png');
 assert.equal(assetURL('/sft-data/media/image.png'),'https://example.com/spatial-mapping-review/sft-data/media/image.png');
 assert.equal(assetURL('/spatial-mapping-review/media/image.png'),'https://example.com/spatial-mapping-review/media/image.png');
 assert.equal(assetURL('media/image.png'),'https://example.com/spatial-mapping-review/media/image.png');
});
test('root hosting and absolute/inline image sources retain their semantics',async()=>{
 const {assetURL}=await withRoot('https://example.com/media.js');
 assert.equal(assetURL('/media/image.png'),'https://example.com/media/image.png');
 for(const url of ['https://cdn.example/image.png','data:image/png;base64,abc','blob:https://example.com/123'])assert.equal(assetURL(url),url);
});
