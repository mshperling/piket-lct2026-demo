'use strict';
importScripts('../inference/engine.js');
const ready = PiketInference.loadModel('../inference/model.json');
ready.then(model => {
  const {label,version,model_cutoff,training_end,threshold,score_note} = model;
  self.postMessage({type:'ready',model:{label,version,model_cutoff,training_end,threshold,score_note}});
}).catch(error => self.postMessage({type:'error',message:error.message}));
self.onmessage = async event => {
  try {
    const model = await ready;
    const rows = PiketInference.parseCSV(event.data.text);
    const result = PiketInference.predictRows(rows, model);
    self.postMessage({type:'result',result});
  } catch (error) {
    self.postMessage({type:'error',message:error.message});
  }
};
