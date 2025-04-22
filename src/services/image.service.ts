import { Injectable } from '@nestjs/common';
import { InscriptionMetadata } from '@/models/inscription';
import { createCanvas, Image, registerFont } from 'canvas';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

/**
 * Service for generating notification images
 */
@Injectable()
export class ImageService {
  constructor() {
    // Register font once when service is initialized
    registerFont(
      path.join(__dirname, '../../src/assets/fonts/Silkscreen-Regular.ttf'),
      { family: 'Silkscreen' },
    );
  }

  private drawTextWithSpacing(
    ctx: import('canvas').CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    spacing: number
  ): number {
    let currentX = x;
    const characters = text.split('');
    
    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      ctx.fillText(char, currentX, y);
      
      const metrics = ctx.measureText(char);
      currentX += metrics.width + spacing;
    }

    return currentX - x;
  }

  private measureTextWithSpacing(
    ctx: import('canvas').CanvasRenderingContext2D,
    text: string,
    spacing: number
  ): number {
    const characters = text.split('');
    let totalWidth = 0;
    
    for (let i = 0; i < characters.length; i++) {
      const metrics = ctx.measureText(characters[i]);
      totalWidth += metrics.width;
      if (i < characters.length - 1) {
        totalWidth += spacing;
      }
    }
    
    return totalWidth;
  }

  async generate(
    hashId: string,
    value: string,
    txHash: string,
    imageUri: string,
    collectionMetadata: InscriptionMetadata,
  ) {
    return await (Number(process.env.CARD_GEN_ENABLED) 
      ? this.generateCardImage(hashId, value, txHash, imageUri, collectionMetadata)
      : this.generateBasicImage(hashId, value, txHash, imageUri, collectionMetadata)
    );
  }

  async generateBasicImage(
    hashId: string,
    value: string,
    txHash: string,
    imageUri: string,
    collectionMetadata: InscriptionMetadata,
  ) {
    const tempCanvas = createCanvas(1200, 1200);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.imageSmoothingEnabled = false;

    const inscriptionImg = await this.createInscriptionImage(imageUri);

    const aspectRatio = inscriptionImg.height / inscriptionImg.width;
    const scaledHeight = Math.round(1200 * aspectRatio);

    const canvas = createCanvas(1200, scaledHeight);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#FF008C';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    tempCtx.drawImage(inscriptionImg, 0, 0, inscriptionImg.width, inscriptionImg.height);
    ctx.drawImage(tempCanvas, 0, 0, inscriptionImg.width, inscriptionImg.height, 
                 0, 0, canvas.width, canvas.height);

    return canvas.toBuffer('image/png');
  }

  async generateCardImage(
    hashId: string,
    value: string,
    txHash: string,
    imageUri: string,
    collectionMetadata: InscriptionMetadata,
  ) {
    const { collectionName, collectionImageUri, websiteLink } = collectionMetadata;

    const backgroundColor = '#FF04B4';
    const textColor = '#000000';
    const frameExtension = 16; // Makes frame 32px larger (16px each side)

    const canvasWidth = 1200;
    const canvasHeight = 1470;
    const padding = 80;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Main background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Black header background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight / 4);

    // Collection image
    const collectionImageSize = 108; // 27 * 4 for pixel perfect scaling
    if (collectionImageUri) {
      const collectionImage = await fetch(collectionImageUri);
      const collectionImageBuffer = await collectionImage.arrayBuffer();
      const collectionImageData = new Uint8Array(collectionImageBuffer);
      const collectionImg = new Image();
      collectionImg.src = Buffer.from(collectionImageData);
      ctx.drawImage(
        collectionImg,
        padding,
        padding,
        collectionImageSize,
        collectionImageSize,
      );
    }

    // Calculate text position to be used for both collection name and URL
    const textStartX = collectionImageUri ? 
      (padding + collectionImageSize + 30) : 
      padding;
      
    // Collection name
    ctx.fillStyle = '#C3FF00';
    ctx.font = 'normal 72px Silkscreen';
    const collectionNameHeight = 55;
    const letterSpacing = -7;
    
    this.drawTextWithSpacing(
      ctx,
      collectionName.toUpperCase(),
      textStartX,
      padding + collectionNameHeight + 5,
      letterSpacing
    );

    // Collection URL
    ctx.fillStyle = '#C3FF00';
    ctx.font = 'normal 40px Silkscreen';
    const urlSpacing = -3;
    const collectionUrl = websiteLink.replace('https://', '');
    const collectionUrlHeight = 20;
    
    this.drawTextWithSpacing(
      ctx,
      collectionUrl.toUpperCase(),
      textStartX + 4,  // Added 5px offset
      padding + collectionNameHeight + collectionUrlHeight + 30,
      urlSpacing
    );

    const inscriptionImg = await this.createInscriptionImage(imageUri);
    const imageWidth = canvasWidth - (padding * 2);
    const imageHeight = canvasWidth - (padding * 2);
    const imageY = padding + collectionNameHeight + collectionUrlHeight + 50 + (padding / 2);

    // Draw black frame
    ctx.fillStyle = '#000000';
    ctx.fillRect(
      padding - frameExtension,
      imageY - frameExtension,
      imageWidth + (frameExtension * 2),
      imageHeight + (frameExtension * 2)
    );

    // Draw pink background for image
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(
      padding,
      imageY,
      imageWidth,
      imageHeight
    );
    
    // Draw inscription image
    ctx.drawImage(
      inscriptionImg,
      padding,
      imageY,
      imageWidth,
      imageHeight
    );

    // Add inscription name to bottom
    ctx.fillStyle = textColor;
    ctx.font = 'normal 96px Silkscreen';
    const nameSpacing = -12;
    
    const itemNameWidth = this.measureTextWithSpacing(
      ctx, 
      collectionMetadata.itemName.toUpperCase(),
      nameSpacing
    );
    
    if (itemNameWidth > canvasWidth - (padding * 2)) {
      ctx.font = 'normal 65px Silkscreen';
    }

    // Position bottom text to align with inscription image's visible edge
    const textStartPosition = padding - frameExtension + 5;  // Added 10px offset to the right
    
    this.drawTextWithSpacing(
      ctx,
      collectionMetadata.itemName.toUpperCase(),
      textStartPosition,  // Use adjusted position to align with frame
      canvasHeight - (padding * 0.75),  // Moved text down by a quarter of padding
      nameSpacing
    );

    return canvas.toBuffer('image/png');
  }

  async createInscriptionImage(imageUri: string) {
    const inscriptionImg = new Image();
    try {
      let imageBuffer: Buffer;
      if (imageUri.startsWith('data:image/svg+xml')) {
        const svgContent = decodeURIComponent(imageUri.split(',')[1]);
        const svgBuffer = Buffer.from(svgContent);
        imageBuffer = await sharp(svgBuffer)
          .png()
          .toBuffer();
      } else {
        const response = await fetch(imageUri);
        const arrayBuffer = await response.arrayBuffer();
        const fetchedBuffer = Buffer.from(arrayBuffer);
        
        if (imageUri.endsWith('.svg')) {
          imageBuffer = await sharp(fetchedBuffer)
            .png()
            .toBuffer();
        } else {
          imageBuffer = fetchedBuffer;
        }
      }
      
      inscriptionImg.src = imageBuffer;
    } catch (error) {
      console.error('Error loading inscription image:', error);
    }

    return inscriptionImg;
  }

  async saveImage(
    collectionName: string,
    hashId: string,
    imageBuffer: Buffer,
  ) {
    const folderPath = path.join(__dirname, '../../_static');
    await mkdir(folderPath, { recursive: true });

    await writeFile(
      path.join(folderPath, `${collectionName}--${hashId}.png`),
      imageBuffer,
    );
  }
}
