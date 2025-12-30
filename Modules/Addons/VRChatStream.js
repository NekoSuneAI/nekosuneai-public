// AUTOAI/VOICEModules/VRChatStream.js
const { spawn } = require('child_process');
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const config = require('../../config/config.json');

let ffmpeg;
let player;
let connection;

async function startStream(channel) {
    if (connection) return 'Already streaming.';

    connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });

    ffmpeg = spawn('ffmpeg', [
        '-f', 'dshow',
        '-i', `audio=${config.addons.AI.AudioVRCPath}`, // or your VB-Cable name
        '-ac', '2',
        '-ar', '48000',
        '-f', 's16le',
        'pipe:1'
    ]);

    player = createAudioPlayer();
    const resource = createAudioResource(ffmpeg.stdout, { inputType: 'arbitrary' });
    player.play(resource);
    connection.subscribe(player);

    return '✅ VRChat audio stream started.';
}

async function stopStream() {
    if (!connection) return 'Not streaming.';
    ffmpeg?.kill('SIGINT');
    player?.stop();
    connection.destroy();
    connection = undefined;
    return '🛑 VRChat audio stream stopped.';
}

module.exports = { startStream, stopStream };
