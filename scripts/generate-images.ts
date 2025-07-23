import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import configsRecord from '../packages/photography/config';
import { cropSpecs, CropType, PhotographyConfig } from '../packages/photography/types/types';

type ConfigMap = Record<string, PhotographyConfig>;
const configs: ConfigMap = configsRecord;

// Use native promises from fs
const { mkdir, readdir } = fs.promises;

// Scale factors for 1x, 2x, 3x versions
const scaleFactors = [
  { suffix: '', scale: 1 },
  { suffix: '@2x', scale: 2 },
  { suffix: '@3x', scale: 3 },
];

// WebP options
const webpOptions = {
  quality: 50,
  lossless: false,
  effort: 4,
  smartSubsample: true,
};

// Function to convert filename to camelCase (for asset filenames)
function toCamelCase(filename: string): string {
  // Remove extension and split by common separators
  const parts = path.basename(filename, path.extname(filename)).split(/[-_\s]+/);

  // Convert to camelCase
  return parts
    .map((part, index) => {
      if (index === 0) {
        return part.toLowerCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

// Creates a base Sharp instance with crop/extract applied
function createCroppedInstance(
  inputPath: string,
  cropType: CropType,
  config: PhotographyConfig,
  originalWidth: number,
  originalHeight: number,
): sharp.Sharp {
  const cropConfig = config.focalPoint?.crops?.[cropType];

  let sharpInstance = sharp(inputPath);

  // Check if we have extract parameters for this crop type
  if (cropConfig?.extractParams) {
    const extractParams = cropConfig.extractParams;
    const zoomFactor = cropConfig.zoom || 1.0;

    // Calculate zoomed dimensions if needed
    let finalWidth = extractParams.width;
    let finalHeight = extractParams.height;
    let finalLeft = extractParams.left;
    let finalTop = extractParams.top;

    // Validate extract parameters are within image bounds
    const validTop = Math.max(0, finalTop);
    const validLeft = Math.max(0, finalLeft);
    const validWidth = Math.min(originalWidth - validLeft, finalWidth);
    const validHeight = Math.min(originalHeight - validTop, finalHeight);

    if (validWidth > 0 && validHeight > 0) {
      console.log(`  Extracting region: top=${validTop}, left=${validLeft}, width=${validWidth}, height=${validHeight}`);

      // Use the extract method with the provided parameters
      sharpInstance = sharpInstance.extract({
        top: validTop,
        left: validLeft,
        width: validWidth,
        height: validHeight,
      });
    } else {
      throw new Error('Invalid extract dimensions');
    }
  } else {
    // No extract parameters, use default center crop
    console.log(`  No extract parameters found for ${cropType}, using center crop`);
  }

  return sharpInstance;
}

// Process a single crop type for an image
async function processCrop(
  inputPath: string,
  outputDir: string,
  baseName: string,
  cropType: CropType,
  config: PhotographyConfig,
  originalWidth: number,
  originalHeight: number,
): Promise<void> {
  const cropSettings = cropSpecs[cropType];
  const formattedCropType = cropType.replace(':', '-').toLowerCase();

  // Create a base instance with all extractions applied
  const baseInstance = createCroppedInstance(inputPath, cropType, config, originalWidth, originalHeight);

  // Process all scale factors in parallel
  await Promise.all(
    scaleFactors.map(async ({ suffix, scale }) => {
      const targetWidth = cropSettings.width * scale;
      const targetHeight = cropSettings.height * scale;
      const outputFileName = `${baseName}_${formattedCropType}${suffix}.webp`;
      const outputPath = path.join(outputDir, outputFileName);

      // Clone the base instance and apply scaling
      await baseInstance
        .clone()
        .resize({
          width: targetWidth,
          height: targetHeight,
          fit: cropSettings.crop as keyof sharp.FitEnum,
          position: 'center',
        })
        .webp(webpOptions)
        .toFile(outputPath);

      console.log(`  Created ${outputFileName} (${targetWidth}x${targetHeight})`);
    }),
  );
}

// Process a single image
async function processImage(file: string, inputDir: string, outputDir: string, processedBaseNames: Map<string, CropType[]>): Promise<void> {
  const inputPath = path.join(inputDir, file);
  const baseName = toCamelCase(file);

  console.log(`Processing ${file} (${baseName})`);

  try {
    // Get config from the imported configs
    const config = configs[baseName];

    if (!config) {
      console.warn(`No config found for ${baseName}, skipping`);
      return;
    }

    // Save the allowed crop types for this image
    const allowedCrops = config.crops || [CropType.PORTRAIT_LARGE];
    processedBaseNames.set(baseName, allowedCrops);

    // Get image metadata once
    const imageMetadata = await sharp(inputPath).metadata();
    const originalWidth = imageMetadata.width || 0;
    const originalHeight = imageMetadata.height || 0;

    // Process each allowed crop type in parallel
    await Promise.all(
      allowedCrops.map((cropType) => processCrop(inputPath, outputDir, baseName, cropType, config, originalWidth, originalHeight)),
    );
  } catch (error) {
    console.error(`Error processing ${file}:`, error);
  }
}

// Main function to process images
async function processImages() {
  const inputDir = './packages/photography/assets/raw';
  const outputDir = './packages/photography/assets/generated';
  const processedBaseNames = new Map<string, CropType[]>();

  // Create output directory if it doesn't exist
  await mkdir(outputDir, { recursive: true });

  // Get list of files in input directory
  const files = await readdir(inputDir);

  // Filter for image files
  const imageFiles = files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
  });

  console.log(`Found ${imageFiles.length} images to process`);

  // Process all images in parallel
  await Promise.all(imageFiles.map((file) => processImage(file, inputDir, outputDir, processedBaseNames)));

  console.log('Image processing complete!');
}

// Run the main function
processImages()
  .then(() => console.log('Done!'))
  .catch((err) => console.error('Error:', err));
