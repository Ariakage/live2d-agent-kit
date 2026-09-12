// Replaced by prepare-preview.py. Coordinates describe the source canvas, not atlas pixels.
export const DRAWING = {width:1024,height:1536};
export const REGIONS = {full:{x:0,y:0,w:1024,h:1536},portrait:{x:0,y:0,w:1024,h:1536},face:{x:0,y:0,w:1024,h:1536}};
export const MODEL_URL = './model/model.model3.json';
export const MODEL_LABEL = 'Live2D 模型';
export const REFERENCE_URL = null;
export const DOWNLOAD_URL = null;
// Example: FaceAngleX:{target:'CustomHeadX',inputMin:-30,inputMax:30,outputMin:-20,outputMax:20}
// Set a source input to false to disable its mapping.
export const INPUT_MAPPING = {};
// Added only when prepare-preview.py receives verified local tracking assets.
export const CAMERA_ASSETS = null;
