import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { TokenConfig } from './config';

const PUMP_FUN_API = 'https://pump.fun/api/ipfs';

export async function uploadMetadata(tokenConfig: TokenConfig): Promise<string> {
  console.log('\n📤 Uploading token metadata to IPFS...');

  try {
    const formData = new FormData();

    // Check if imageUrl is a local file or a remote URL
    if (tokenConfig.imageUrl.startsWith('http')) {
      // Remote URL — download it first then upload
      console.log('   Downloading image from URL...');
      const imageResponse = await axios.get(tokenConfig.imageUrl, {
        responseType: 'arraybuffer',
      });

      const imageBuffer = Buffer.from(imageResponse.data);
      const contentType = imageResponse.headers['content-type'] || 'image/png';
      const extension = contentType.split('/')[1] || 'png';

      formData.append('file', imageBuffer, {
        filename: `token-image.${extension}`,
        contentType: contentType,
      });
    } else {
      // Local file path
      if (!fs.existsSync(tokenConfig.imageUrl)) {
        throw new Error(`Image file not found: ${tokenConfig.imageUrl}`);
      }

      const imageBuffer = fs.readFileSync(tokenConfig.imageUrl);
      const extension = path.extname(tokenConfig.imageUrl).slice(1) || 'png';

      formData.append('file', imageBuffer, {
        filename: `token-image.${extension}`,
        contentType: `image/${extension}`,
      });
    }

    // Append token metadata
    formData.append('name', tokenConfig.name);
    formData.append('symbol', tokenConfig.symbol);
    formData.append('description', tokenConfig.description);

    if (tokenConfig.twitter) formData.append('twitter', tokenConfig.twitter);
    if (tokenConfig.telegram) formData.append('telegram', tokenConfig.telegram);
    if (tokenConfig.website) formData.append('website', tokenConfig.website);

    formData.append('showName', 'true');

    // Upload to pump.fun IPFS
    const response = await axios.post(PUMP_FUN_API, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000,
    });

    if (!response.data || !response.data.metadataUri) {
      throw new Error('No metadata URI returned from pump.fun IPFS!');
    }

    const metadataUri = response.data.metadataUri;
    console.log(`✅ Metadata uploaded successfully!`);
    console.log(`   URI: ${metadataUri}`);

    return metadataUri;

  } catch (error: any) {
    if (error.response) {
      throw new Error(`Metadata upload failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Metadata upload failed: ${error.message}`);
  }
}