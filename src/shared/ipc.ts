export const IPC = {
  workspaceGet: 'workspace:get',
  workspaceRename: 'workspace:rename',
  settingsSave: 'settings:save',
  collectionSave: 'collection:save',
  envSave: 'env:save',
  envSetActive: 'env:setActive',
  httpSend: 'http:send',
  httpCancel: 'http:cancel',
  runsList: 'runs:list',
  runsGet: 'runs:get',
  runsSaveExample: 'runs:saveExample',
  runsAppended: 'runs:appended',
  transferExport: 'transfer:export',
  transferImport: 'transfer:import',
  shellOpenExternal: 'shell:openExternal'
} as const
