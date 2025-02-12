
const path = require('path');

module.exports = {
    mode: 'production',
    target: 'node',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename]
        }
    },
    externals: {
        vscode: 'commonjs vscode',
        buffer: 'commonjs buffer',
        fs: 'commonjs fs',
        path: 'commonjs path'
    },
    // devtool: 'source-map',
    devtool: 'eval-cheap-module-source-map',
};