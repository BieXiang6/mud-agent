const path = require('node:path')

module.exports = {
  appId: 'cn.mudagent.desktop',
  productName: '这是江湖智能体',
  electronVersion: '41.7.1',
  // Electron is already installed as a devDependency. Reusing it avoids a
  // second, often very slow GitHub download during every clean package build.
  electronDist: path.join(__dirname, 'node_modules', 'electron', 'dist'),
  asar: true,
  npmRebuild: false,
  directories: {
    output: '../../release/electron',
    buildResources: '../../static/icons'
  },
  files: ['**/*', '!icon.png'],
  win: {
    icon: 'icon.png',
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${productName}-${version}-${arch}-setup.${ext}'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  }
}
