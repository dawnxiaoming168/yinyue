// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 添加全局变量
let searchKeyword = ''; // 搜索关键词

// 搜索歌曲
async function searchSongs(keyword) {
    if (!keyword || !keyword.trim()) {
        document.getElementById('songList').innerHTML = '';
        searchResults = [];
        return;
    }

    try {
        document.getElementById('songList').innerHTML = '<div class="loading">搜索中...</div>';
        
        searchKeyword = keyword.trim();
        const response = await fetch(`https://www.hhlqilongzhu.cn/api/dg_wyymusic.php?gm=${encodeURIComponent(searchKeyword)}&num=50`);
        
        if (!response.ok) {
            throw new Error('网络请求失败');
        }
        
        const text = await response.text();
        
        // 解析返回的文本
        searchResults = text.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const match = line.match(/(\d+)、(.*) -- (.*)/);
                if (match) {
                    return {
                        index: match[1],
                        title: match[2].trim(),
                        artist: match[3].trim(),
                        searchKeyword: searchKeyword // 保存搜索关键词
                    };
                }
                return null;
            })
            .filter(song => song);

        if (searchResults.length === 0) {
            document.getElementById('songList').innerHTML = '<div class="empty-list">未找到相关歌曲</div>';
            return;
        }

        displaySongs(searchResults);
    } catch (error) {
        console.error('搜索出错：', error);
        document.getElementById('songList').innerHTML = '<div class="error">搜索出错，请稍后重试</div>';
    }
}

// 显示搜索结果
function displaySongs(songs) {
    currentView = 'search';
    document.getElementById('clearHistory').style.display = 'none';
    const songList = document.getElementById('songList');
    songList.innerHTML = songs.map((song, index) => `
        <div class="song-item ${currentPlaylist === 'search' && currentSongIndex === index ? 'playing' : ''}" 
             onclick="playSong('${song.index}', '${song.title}', '${song.artist}')">
            <span>${song.index}、</span>
            <div class="song-info">
                <span class="song-title">${song.title}</span>
                <span class="song-artist">${song.artist}</span>
            </div>
            <button class="play-btn" data-index="${song.index}" onclick="event.stopPropagation(); togglePlay('${song.index}', '${song.title}', '${song.artist}', this)">
                ${currentPlaylist === 'search' && currentSongIndex === index ? (currentAudio && !currentAudio.paused ? '⏸️' : '▶️') : '▶️'}
            </button>
            <button class="like-btn ${isLiked(song.title, song.artist) ? 'liked' : ''}" 
                    onclick="event.stopPropagation(); toggleLike('${song.index}', '${song.title}', '${song.artist}')">
                ${isLiked(song.title, song.artist) ? '💖' : '❤️'}
            </button>
        </div>
    `).join('');

    updateNavigation();
}

// 解析歌词
function parseLyric(lrc) {
    if (!lrc) {
        return [{ time: 0, text: '暂无歌词' }];
    }
    
    const lyrics = lrc.split('\n')
        .map(line => {
            const match = line.match(/\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/);
            if (match) {
                return {
                    time: parseInt(match[1]) * 60 + parseFloat(match[2]),
                    text: match[3].trim()
                };
            }
            return null;
        })
        .filter(lyric => lyric && lyric.text);
    
    return lyrics.length > 0 ? lyrics : [{ time: 0, text: '暂无歌词' }];
}

let currentAudio = null;
let currentLyrics = [];
let lyricIndex = 0;

// 播放历史相关变量
let playHistory = JSON.parse(localStorage.getItem('playHistory') || '[]');
const MAX_HISTORY = 50;

// 保存播放历史到本地存储
function savePlayHistory() {
    localStorage.setItem('playHistory', JSON.stringify(playHistory));
}

// 添加到播放历史
function addToHistory(songInfo) {
    try {
        if (!validateSongInfo(songInfo)) {
            throw new Error('歌曲信息不完整');
        }

        const existingIndex = playHistory.findIndex(item => 
            item.title === songInfo.title && item.artist === songInfo.artist
        );

        if (existingIndex !== -1) {
            playHistory.splice(existingIndex, 1);
        }

        playHistory.unshift(songInfo);
        
        if (playHistory.length > MAX_HISTORY) {
            playHistory = playHistory.slice(0, MAX_HISTORY);
        }

        savePlayHistory();

        if (currentView === 'history') {
            displayHistory();
        }
    } catch (error) {
        handleError(error, '添加播放历史失败');
    }
}

// 删除单条历史记录
function deleteHistoryItem(index, event) {
    event.stopPropagation();
    playHistory.splice(index, 1);
    savePlayHistory();
    displayHistory();
}

// 清空播放历史
function clearHistory() {
    if (confirm('确定要清空播放历史吗？')) {
        playHistory = [];
        savePlayHistory();
        displayHistory();
    }
}

let currentSongIndex = -1; // 当前播放歌曲在列表中的索引
let searchResults = []; // 保存搜索结果
let currentPlaylist = 'search'; // 当前播放列表类型：'search' 或 'favorites'

// 修改 getCurrentPlaylist 函数
function getCurrentPlaylist() {
    // 如果当前播放的歌曲来自搜索结果，但现在在其他视图，返回空列表
    if (currentPlaylist === 'search' && currentView !== 'search') {
        return [];
    }
    // 如果当前播放的歌曲来自收藏列表，但现在在其他视图，返回空列表
    if (currentPlaylist === 'favorites' && currentView !== 'favorites') {
        return [];
    }

    switch(currentPlaylist) {
        case 'favorites':
            return likedSongs;
        case 'search':
            return searchResults;
        default:
            return [];
    }
}

// 修改播放上一首/下一首功能
async function playPrevious() {
    const currentList = getCurrentPlaylist();
    if (currentPlaylist === 'history' || currentList.length === 0) {
        alert('当前列表不支持连续播放');
        return;
    }

    if (currentSongIndex === -1) {
        currentSongIndex = currentList.length - 1;
    } else {
        currentSongIndex = (currentSongIndex - 1 + currentList.length) % currentList.length;
    }

    const song = currentList[currentSongIndex];
    await playSong(song.index, song.title, song.artist);
}

async function playNext() {
    const currentList = getCurrentPlaylist();
    if (currentPlaylist === 'history' || currentList.length === 0) {
        alert('当前列表不支持连续播放');
        return;
    }

    currentSongIndex = (currentSongIndex + 1) % currentList.length;

    const song = currentList[currentSongIndex];
    await playSong(song.index, song.title, song.artist);
}

// 修改播放歌曲函数
async function playSong(index, title, artist) {
    try {
        if (!index || !title || !artist) {
            throw new Error('歌曲信息不完整');
        }

        if (currentAudio && !currentAudio.paused) {
            currentAudio.pause();
        }

        // 获取正确的搜索关键词和播放列表
        const songInfo = await getSongInfo(index, title, artist);
        if (!songInfo) {
            throw new Error('无法获取歌曲信息');
        }

        await loadAndPlaySong(songInfo);
        updateDisplay();
        addToHistory(songInfo);

    } catch (error) {
        handleError(error, '播放失败，请稍后重试');
        resetPlayState();
    }
}

// 格式化时间
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 二分查找当前歌词
function findCurrentLyricIndex(currentTime) {
    let left = 0;
    let right = currentLyrics.length - 1;
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (currentLyrics[mid].time <= currentTime) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return Math.max(0, right);
}

// 更新歌词显示
function updateLyrics(currentTime) {
    const lyricsContainer = document.querySelector('.lyrics');
    if (!currentLyrics.length) return;

    // 找到当前时间对应的歌词
    const currentLyric = currentLyrics.reduce((prev, curr) => 
        (curr.time <= currentTime) ? curr : prev
    );

    // 生成所有歌词的HTML
    const html = currentLyrics
        .map(lyric => `<div class="lyric-line ${lyric === currentLyric ? 'active' : ''}">${lyric.text}</div>`)
        .join('');

    // 使用 requestAnimationFrame 优化渲染
    requestAnimationFrame(() => {
        lyricsContainer.innerHTML = html;

        // 自动滚动到当前歌词
        const activeLyric = lyricsContainer.querySelector('.active');
        if (activeLyric) {
            const containerHeight = lyricsContainer.offsetHeight;
            const lyricHeight = activeLyric.offsetHeight;
            const lyricTop = activeLyric.offsetTop;
            
            // 计算滚动位置，使当前歌词居中显示
            const scrollTo = lyricTop - (containerHeight / 2) + (lyricHeight / 2);
            lyricsContainer.scrollTop = scrollTo;
        }
    });
}

// 音量控制功能
function setVolume(value) {
    if (currentAudio) {
        currentAudio.volume = value;
        localStorage.setItem('playerVolume', value);
    }
}

// 下载当前歌曲
async function downloadCurrentSong() {
    if (!currentAudio || !currentAudio.src) {
        alert('没有正在播放的歌曲');
        return;
    }

    try {
        const response = await fetch(currentAudio.src);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        // 获取当前歌曲标题
        const title = document.querySelector('.current-song-title').textContent;
        const artist = document.querySelector('.current-song-artist').textContent;
        a.download = `${title} - ${artist}.mp3`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('下载失败：', error);
        alert('下载失败，请稍后重试');
    }
}

// 设置播放速度
function setPlaybackRate(rate) {
    if (currentAudio) {
        currentAudio.playbackRate = rate;
        localStorage.setItem('playerPlaybackRate', rate);
    }
}

// 添加喜欢歌曲相关变量和函数
let likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '[]');
let currentView = 'search'; // 'search' 或 'favorites'

// 切换喜欢状态
function toggleLike(index, title, artist) {
    const songInfo = { 
        index, 
        title, 
        artist,
        searchKeyword: searchKeyword // 保存搜索关键词
    };
    const songKey = `${title}-${artist}`;
    const likeBtn = event.target;
    const indexLiked = likedSongs.findIndex(s => `${s.title}-${s.artist}` === songKey);
    
    if (indexLiked === -1) {
        likedSongs.push(songInfo);
        likeBtn.textContent = '💖';
        likeBtn.classList.add('liked');
    } else {
        likedSongs.splice(indexLiked, 1);
        likeBtn.textContent = '❤️';
        likeBtn.classList.remove('liked');
        
        if (currentView === 'favorites') {
            displayLikedSongs();
        }
    }
    
    localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
}

// 检查歌曲是否已喜欢
function isLiked(title, artist) {
    return likedSongs.some(song => song.title === title && song.artist === artist);
}

// 显示喜欢的歌曲列表
function displayLikedSongs() {
    currentView = 'favorites';
    document.getElementById('clearHistory').style.display = 'none';
    const songList = document.getElementById('songList');
    
    if (likedSongs.length === 0) {
        songList.innerHTML = '<div class="empty-list">还没有添加喜欢的歌曲哦~</div>';
        return;
    }
    
    // 获取当前播放歌曲的信息
    const currentSongTitle = document.querySelector('.current-song-title').textContent;
    const currentSongArtist = document.querySelector('.current-song-artist').textContent;
    
    songList.innerHTML = likedSongs.map((song, index) => {
        // 检查是否是当前播放的歌曲
        const isCurrentSong = currentPlaylist === 'favorites' && 
            song.title === currentSongTitle && 
            song.artist === currentSongArtist;
        
        return `
            <div class="song-item ${isCurrentSong ? 'playing' : ''}" 
                 onclick="playSong('${song.index}', '${song.title}', '${song.artist}')">
                <span>${index + 1}、</span>
                <div class="song-info">
                    <span class="song-title">${song.title}</span>
                    <span class="song-artist">${song.artist}</span>
                </div>
                <button class="play-btn" data-index="${song.index}" 
                        onclick="event.stopPropagation(); togglePlay('${song.index}', '${song.title}', '${song.artist}', this)">
                    ${isCurrentSong ? (currentAudio && !currentAudio.paused ? '⏸️' : '▶️') : '▶️'}
                </button>
                <button class="like-btn liked" 
                        onclick="event.stopPropagation(); toggleLike('${song.index}', '${song.title}', '${song.artist}')">💖</button>
            </div>
        `;
    }).join('');

    // 更新导航栏状态
    updateNavigation();
}

// 显示播放历史
function displayHistory() {
    currentView = 'history';
    const songList = document.getElementById('songList');
    const clearBtn = document.getElementById('clearHistory');
    
    clearBtn.style.display = 'flex';
    document.querySelector('h3').textContent = '播放历史';
    
    if (playHistory.length === 0) {
        songList.innerHTML = '<div class="empty-list">还没有播放过歌曲哦~</div>';
        clearBtn.style.display = 'none';
        return;
    }
    
    const currentSongTitle = document.querySelector('.current-song-title').textContent;
    const currentSongArtist = document.querySelector('.current-song-artist').textContent;
    
    songList.innerHTML = playHistory.map((song, index) => {
        const isCurrentSong = currentPlaylist === 'history' && 
            song.title === currentSongTitle && 
            song.artist === currentSongArtist;
        
        return `
            <div class="song-item ${isCurrentSong ? 'playing' : ''}" 
                 onclick="playSong('${song.index}', '${song.title}', '${song.artist}')">
                <span>${index + 1}、</span>
                <div class="song-info">
                    <span class="song-title">${song.title}</span>
                    <span class="song-artist">${song.artist}</span>
                </div>
                <button class="play-btn" data-index="${song.index}" 
                        onclick="event.stopPropagation(); togglePlay('${song.index}', '${song.title}', '${song.artist}', this)">
                    ${isCurrentSong ? (currentAudio && !currentAudio.paused ? '⏸️' : '▶️') : '▶️'}
                </button>
                <button class="like-btn ${isLiked(song.title, song.artist) ? 'liked' : ''}" 
                        onclick="event.stopPropagation(); toggleLike('${song.index}', '${song.title}', '${song.artist}')">
                    ${isLiked(song.title, song.artist) ? '💖' : '❤️'}
                </button>
                <button class="delete-btn" onclick="deleteHistoryItem(${index}, event)">
                    🗑️
                </button>
            </div>
        `;
    }).join('');

    updateNavigation();
}

// 添加导航状态更新函数
function updateNavigation() {
    const searchNav = document.querySelector('.search');
    const favoritesNav = document.querySelector('.favorites');
    const historyNav = document.querySelector('.local-music');

    // 移除所有活动状态
    [searchNav, favoritesNav, historyNav].forEach(nav => {
        nav.classList.remove('active');
    });

    // 添加当前视图活动状态
    if (currentView === 'favorites') {
        favoritesNav.classList.add('active');
    } else if (currentView === 'search') {
        searchNav.classList.add('active');
    } else if (currentView === 'history') {
        historyNav.classList.add('active');
    }
}

// 添加播放/暂停切换功能
async function togglePlay(index, title, artist, button) {
    const mainPlayButton = document.querySelector('.control-buttons button:nth-child(2)');
    
    // 如果点击的是前播放的歌曲
    if (currentAudio && button.parentElement.classList.contains('playing')) {
        if (currentAudio.paused) {
            // 继续播放
            await currentAudio.play();
            button.textContent = '⏸️';
            mainPlayButton.textContent = '⏸️';
        } else {
            // 暂停播放
            currentAudio.pause();
            button.textContent = '▶️';
            mainPlayButton.textContent = '▶️';
        }
    } else {
        // 播放新的歌曲
        // 先更新按钮状态
        button.textContent = '⏸️';
        mainPlayButton.textContent = '⏸️';
        // 移除其他歌曲的播放状态
        document.querySelectorAll('.song-item').forEach(item => {
            item.classList.remove('playing');
            item.querySelector('.play-btn').textContent = '▶️';
        });
        // 添加当前歌曲的播放状态
        button.parentElement.classList.add('playing');
        await playSong(index, title, artist);
    }
}

// 修改更新播放按钮状态的函数
function updatePlayButtons() {
    const songItems = document.querySelectorAll('.song-item');
    const mainPlayButton = document.querySelector('.control-buttons button:nth-child(2)');
    const isPlaying = currentAudio && !currentAudio.paused;
    
    // 修复错误的字符
    mainPlayButton.textContent = isPlaying ? '⏸️' : '▶️';
    
    // 更新列表中的播放按钮状态
    songItems.forEach((item, index) => {
        const playBtn = item.querySelector('.play-btn');
        const isCurrentSong = (currentPlaylist === currentView && index === currentSongIndex);
        
        if (isCurrentSong) {
            playBtn.textContent = isPlaying ? '⏸️' : '▶️';
            item.classList.add('playing');
            // 确保当前播放的歌曲可见
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            playBtn.textContent = '▶️';
            item.classList.remove('playing');
        }
    });
}

// 当页加载完成时添加事件监听
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.querySelector('.search input');
    const progressBar = document.querySelector('.progress');
    const playButton = document.querySelector('.control-buttons button:nth-child(2)');
    const volumeButton = document.querySelector('.dropdown-item:nth-child(2)');
    const downloadButton = document.querySelector('.dropdown-item:nth-child(1)');
    const playbackRateButton = document.querySelector('.dropdown-item:nth-child(3)');
    
    // 初始化进度条状态
    progressBar.style.setProperty('--progress-position', '0%');

    // 修改音量控制器的HTML
    volumeButton.innerHTML = `
        <div class="control-wrapper">
            <div class="control-label">
                <i>🔊</i>
                <span>音量</span>
            </div>
            <input type="range" min="0" max="1" step="0.1" value="${localStorage.getItem('playerVolume') || 1}" class="volume-slider">
        </div>
    `;

    // 修改播放速度控制器的HTML
    playbackRateButton.innerHTML = `
        <div class="control-wrapper">
            <div class="control-label">
                <i>⚡</i>
                <span>倍速</span>
            </div>
            <select class="rate-select">
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1" selected>1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2.0x</option>
            </select>
        </div>
    `;

    // 音量控制事件
    const volumeInput = volumeButton.querySelector('.volume-slider');
    volumeInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        setVolume(value);
        // 更新音量图标
        const volumeIcon = volumeButton.querySelector('i');
        if (value === 0) {
            volumeIcon.textContent = '🔇';
        } else if (value < 0.5) {
            volumeIcon.textContent = '🔈';
        } else {
            volumeIcon.textContent = '🔊';
        }
        e.stopPropagation();
    });

    // 下载按钮事件
    downloadButton.addEventListener('click', downloadCurrentSong);

    // 播放速度控制事件
    const playbackRateSelect = playbackRateButton.querySelector('.rate-select');
    playbackRateSelect.addEventListener('change', (e) => {
        const value = parseFloat(e.target.value);
        setPlaybackRate(value);
        // 保存设置
        localStorage.setItem('playerPlaybackRate', value);
        e.stopPropagation();
    });

    // 恢复之前的音量和播放速度设置
    const savedVolume = localStorage.getItem('playerVolume');
    const savedPlaybackRate = localStorage.getItem('playerPlaybackRate');
    
    if (savedVolume) {
        volumeInput.value = savedVolume;
    }
    
    if (savedPlaybackRate) {
        playbackRateSelect.value = savedPlaybackRate;
    }

    // 播放/暂停按钮点击事件
    playButton.addEventListener('click', async () => {
        if (currentAudio) {
            if (currentAudio.paused) {
                await currentAudio.play();
                playButton.textContent = '⏸️';
            } else {
                currentAudio.pause();
                playButton.textContent = '▶️';
            }
            // 更新所有播放按钮状态
            updatePlayButtons();
        }
    });

    // 进度条点击和拖动��
    let isDragging = false;
    
    progressBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateProgressFromEvent(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            updateProgressFromEvent(e);
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    function updateProgressFromEvent(e) {
        if (currentAudio) {
            const rect = progressBar.getBoundingClientRect();
            let percent = (e.clientX - rect.left) / rect.width;
            // 确保百分比在0-1之间
            percent = Math.max(0, Math.min(1, percent));
            currentAudio.currentTime = percent * currentAudio.duration;
        }
    }

    // 搜索功能
    const debouncedSearch = debounce((value) => {
        searchSongs(value);
    }, 300);

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            debouncedSearch(e.target.value);
        }
    });

    // 添加上一首下一首按钮事件
    const prevButton = document.querySelector('.control-buttons button:first-child');
    const nextButton = document.querySelector('.control-buttons button:last-child');

    prevButton.addEventListener('click', playPrevious);
    nextButton.addEventListener('click', playNext);

    // 添加我喜欢的点击事件
    const favoritesButton = document.querySelector('.favorites');
    favoritesButton.addEventListener('click', () => {
        document.querySelector('h3').textContent = '我喜欢的音乐';
        displayLikedSongs();
    });

    // 添加搜索按钮点击事件（返回搜索视图）
    const searchDiv = document.querySelector('.search');
    searchDiv.addEventListener('click', () => {
        document.querySelector('h3').textContent = '搜索结果：';
        if (searchInput.value.trim()) {
            searchSongs(searchInput.value);
        } else {
            document.getElementById('songList').innerHTML = '';
        }
    });

    // 键盘快捷键支持
    document.addEventListener('keydown', (e) => {
        if (currentAudio) {
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    if (currentAudio.paused) {
                        currentAudio.play();
                    } else {
                        currentAudio.pause();
                    }
                    updatePlayButtons();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    currentAudio.currentTime = Math.max(0, currentAudio.currentTime - 5);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    currentAudio.currentTime = Math.min(currentAudio.duration, currentAudio.currentTime + 5);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setVolume(Math.min(1, currentAudio.volume + 0.1));
                    volumeInput.value = currentAudio.volume;
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    setVolume(Math.max(0, currentAudio.volume - 0.1));
                    volumeInput.value = currentAudio.volume;
                    break;
            }
        }
    });

    // 添加历史记录按钮点击事件
    const historyButton = document.querySelector('.local-music');
    historyButton.addEventListener('click', displayHistory);

    // 添加清空历史按钮事件
    const clearHistoryBtn = document.getElementById('clearHistory');
    clearHistoryBtn.addEventListener('click', clearHistory);

    // 添加纯歌词模式切换功能
    const musicInfo = document.querySelector('.music-info');
    const cover = document.querySelector('.cover');
    
    // 创建切换按钮
    const toggleButton = document.createElement('button');
    toggleButton.className = 'toggle-lyrics-mode';
    toggleButton.innerHTML = '📖';
    toggleButton.title = '切换纯歌词模式';
    cover.appendChild(toggleButton);

    // 切换纯歌词模式
    function toggleLyricsMode(event) {
        if (event) {
            event.stopPropagation();
        }
        
        const isEnteringLyricsMode = !musicInfo.classList.contains('lyrics-mode');
        musicInfo.classList.toggle('lyrics-mode');
        
        // 更新按钮状态
        toggleButton.innerHTML = isEnteringLyricsMode ? '🖼️' : '📖';
        toggleButton.title = isEnteringLyricsMode ? '显示封面' : '切换纯歌词模式';
        
        // 如果在纯歌词模式下，更新歌词显示
        if (isEnteringLyricsMode && currentAudio) {
            updateLyrics(currentAudio.currentTime);
        }
    }

    // 添加点击事件监听器
    toggleButton.addEventListener('click', (event) => {
        event.stopPropagation(); // 阻止事件冒泡
        toggleLyricsMode(event);
    });

    const lyricsContainer = document.querySelector('.lyrics');

    // 修改双击事件监听器
    lyricsContainer.addEventListener('dblclick', (event) => {
        event.stopPropagation(); // 阻止事件冒泡
        if (musicInfo.classList.contains('lyrics-mode')) {
            toggleLyricsMode();
        }
    });

    // 防止歌词文本被选中
    lyricsContainer.addEventListener('selectstart', (event) => {
        if (musicInfo.classList.contains('lyrics-mode')) {
            event.preventDefault();
        }
    });

    // 添加封面点击事件
    cover.addEventListener('click', (event) => {
        event.stopPropagation(); // 阻止事件冒泡
        if (!musicInfo.classList.contains('lyrics-mode')) {
            toggleLyricsMode(event);
        }
    });
}); 

// 1. 添加错误处理工具函数
function handleError(error, message = '操作失败') {
    console.error(error);
    alert(message);
}

// 2. 添加数据验证函数
function validateSongInfo(songInfo) {
    if (!songInfo) return false;
    
    const requiredFields = ['title', 'artist', 'index', 'searchKeyword'];
    const missingFields = requiredFields.filter(field => !songInfo[field]);
    
    if (missingFields.length > 0) {
        console.warn('歌曲信息不完整，缺少字段：', missingFields);
        return false;
    }
    
    return true;
}

// 3. 添加歌曲信息获取函数
async function getSongInfo(index, title, artist) {
    try {
        if (!index || !title || !artist) {
            throw new Error('参数不完整');
        }

        let songInfo;

        switch(currentView) {
            case 'favorites':
                songInfo = likedSongs.find(song => 
                    song.title === title && song.artist === artist
                );
                if (!songInfo) throw new Error('收藏列表中未找到该歌曲');
                if (!validateSongInfo(songInfo)) throw new Error('收藏列表中的歌曲信息不完整');
                currentPlaylist = 'favorites';
                break;

            case 'history':
                songInfo = playHistory.find(song => 
                    song.title === title && song.artist === artist
                );
                if (!songInfo) throw new Error('播放历史中未找到该歌曲');
                if (!validateSongInfo(songInfo)) throw new Error('播放历史中的歌曲信息不完整');
                currentPlaylist = 'history';
                break;

            default:
                songInfo = searchResults.find(song => 
                    song.title === title && song.artist === artist
                );
                if (!songInfo) throw new Error('搜索结果中未找到该歌曲');
                if (!validateSongInfo(songInfo)) throw new Error('搜索结果中的歌曲信息不完整');
                currentPlaylist = 'search';
                break;
        }

        currentSongIndex = getCurrentPlaylist().indexOf(songInfo);

        return {
            ...songInfo,
            searchKeyword: songInfo.searchKeyword
        };
    } catch (error) {
        throw new Error(`获取歌曲信息失败: ${error.message}`);
    }
}

// 4. 添加音频加载和播放函数
async function loadAndPlaySong(songInfo) {
    try {
        const response = await fetch(
            `https://www.hhlqilongzhu.cn/api/dg_wyymusic.php?gm=${
                encodeURIComponent(songInfo.searchKeyword)
            }&n=${songInfo.index}&type=json&num=50`
        );

        if (!response.ok) throw new Error('网络请求失败');
        
        const data = await response.json();
        if (!data.code === 200 || !data.music_url) {
            throw new Error('获取歌曲数据失败');
        }

        await setupAudioPlayer(data);
    } catch (error) {
        throw new Error(`加载歌曲失败: ${error.message}`);
    }
}

// 5. 重置播放状态
function resetPlayState() {
    const playButton = document.querySelector('.control-buttons button:nth-child(2)');
    playButton.textContent = '▶️';
    updatePlayButtons();
}

// 6. 优化显示更新函数
function updateDisplay() {
    switch(currentView) {
        case 'favorites':
            displayLikedSongs();
            break;
        case 'history':
            displayHistory();
            break;
        default:
            displaySongs(searchResults);
    }
}

// 7. 优化本地存储操作
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        handleError(error, '保存数据失败');
    }
}

function getFromLocalStorage(key, defaultValue = []) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (error) {
        handleError(error, '读取数据失败');
        return defaultValue;
    }
}

// 添加音频播放器设置函数
async function setupAudioPlayer(data) {
    try {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.removeEventListener('timeupdate', updateProgress);
            currentAudio = null;
        }

        // 更新UI状态
        const playButton = document.querySelector('.control-buttons button:nth-child(2)');
        playButton.textContent = '⌛';
        updatePlayButtons();

        // 更新封面
        const cover = document.querySelector('.cover');
        cover.innerHTML = data.cover ? 
            `<img src="${data.cover}" alt="${data.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 15px;">` :
            `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">暂无封面</div>`;

        //封面也为body背景图片还有样式
        // document.body.style.backgroundImage = `url(${data.cover})`;
        // document.body.style.backgroundSize = 'cover';
        // document.body.style.backgroundPosition = 'center';
        // document.body.style.backgroundRepeat = 'no-repeat';

        // 更新歌曲信息
        document.querySelector('.current-song-title').textContent = data.title || '未知歌曲';
        document.querySelector('.current-song-artist').textContent = data.singer || '未知歌手';

        // 解析歌词
        currentLyrics = parseLyric(data.lrc);
        lyricIndex = 0;
        updateLyrics(0);

        // 创建音频对象
        currentAudio = new Audio(data.music_url);
        
        // 更新进度条
        const progressBar = document.querySelector('.progress');
        progressBar.style.setProperty('--progress-position', '0%');
        
        // 更新播放按钮状态
        updatePlayButtons();
        playButton.textContent = '⏸️';

        // 进度更新函数
        function updateProgress() {
            if (currentAudio && currentAudio.duration && !isNaN(currentAudio.duration)) {
                // 更新进度条
                const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
                progressBar.style.setProperty('--progress-position', `${progress}%`);

                // 更新时间显示
                const currentTime = formatTime(currentAudio.currentTime);
                const duration = formatTime(currentAudio.duration);
                document.querySelector('.progress-bar span:first-child').textContent = currentTime;
                document.querySelector('.progress-bar span:last-child').textContent = duration;

                // 更新歌词
                updateLyrics(currentAudio.currentTime);
            }
        }

        // 重置时间显示
        document.querySelector('.progress-bar span:first-child').textContent = '0:00';
        document.querySelector('.progress-bar span:last-child').textContent = '0:00';

        // 设置音频事件监听
        currentAudio.addEventListener('loadedmetadata', () => {
            if (currentAudio && !isNaN(currentAudio.duration)) {
                document.querySelector('.progress-bar span:last-child').textContent = formatTime(currentAudio.duration);
            }
        });

        currentAudio.addEventListener('timeupdate', updateProgress);

        currentAudio.addEventListener('ended', () => {
            playButton.textContent = '▶️';
            progressBar.style.setProperty('--progress-position', '0%');
            // 只在当前视图与播放列表匹配时自动播放下一首
            const currentList = getCurrentPlaylist();
            if (currentList.length > 0 && currentPlaylist === currentView) {
                playNext();
            }
        });

        currentAudio.addEventListener('error', (e) => {
            console.error('音频加载错误：', e);
            playButton.textContent = '▶️';
            alert('音频加载失败，请重试');
        });

        // 恢复之前的音量和播放速度设置
        const savedVolume = localStorage.getItem('playerVolume');
        const savedPlaybackRate = localStorage.getItem('playerPlaybackRate');
        
        if (savedVolume) {
            currentAudio.volume = parseFloat(savedVolume);
        }
        
        if (savedPlaybackRate) {
            currentAudio.playbackRate = parseFloat(savedPlaybackRate);
        }

        // 设置音频源并播放
        currentAudio.src = data.music_url;
        await currentAudio.play();

    } catch (error) {
        throw new Error(`设置音频播放器失败: ${error.message}`);
    }
} 