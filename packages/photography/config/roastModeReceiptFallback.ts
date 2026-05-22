import { DEFAULT_CROP_TYPES, PhotographyConfig } from '../types/types';

const config: PhotographyConfig = {
  cropTypes: [...DEFAULT_CROP_TYPES, 'SOCIAL_SHARE'],
};

export default config;
