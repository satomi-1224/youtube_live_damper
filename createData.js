const puppeteer = require('puppeteer');
const { Innertube } = require('youtubei.js');
const fs = require('fs');
const dayjs = require('dayjs');

// JSONファイルを結合
const createCreators = () => {
  const hololive = require('./creators/hololive.json');
  const nijisanji = require('./creators/nijisanji.json');
  return [...hololive, ...nijisanji];
};

// ライブ配信のステータスを判定
const getStatus = (isLive, isUpcoming) => {
  if (isLive) return 'live';
  return isUpcoming ? 'upcoming' : 'completed';
};

// 日本時間に変換
const toJST = datetime => dayjs(datetime).add(9, 'hour').toDate();

// 配信コンテンツの取得
const getContents = async (page, channelTag) => {
  const channelPath = `https://www.youtube.com/@${channelTag}/streams`;
  await page.goto(channelPath, { waitUntil: 'networkidle0' });
  const elements = await page.$$('#video-title-link');
  const hrefs = await Promise.all(elements.map(el => page.evaluate(e => e.href, el)));
  return hrefs.map(href => href.split('https://www.youtube.com/watch?v=').join(''));
};

// メイン処理
const getDetail = async (page, creator) => {
  const channelTag = creator.channelTag;

  const videoIds = await getContents(page, channelTag);

  const youtube = await Innertube.create();

  const details = await Promise.all(videoIds.map(async videoId => {
    try {
      const videoInfo = await youtube.getInfo(videoId);
      const startDatetime = toJST(videoInfo.basic_info.start_timestamp);
      const endDatetime = toJST(videoInfo.basic_info.end_timestamp || dayjs());
      const diffInMilliseconds = dayjs(endDatetime).diff(dayjs(startDatetime));
      const seconds = diffInMilliseconds / 1000;

      return {
        creator: {
          channelId: creator.channelId,
          channelTag: creator.channelTag,
          channelName: creator.name,
          channelUrl: videoInfo.basic_info.channel.url,
          channelIcon: creator.avatar,
          tag: creator.tag,
        },
        id: videoInfo.basic_info.id,
        title: videoInfo.basic_info.title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: videoInfo.basic_info.thumbnail[0].url,
        status: getStatus(videoInfo.basic_info.is_live, videoInfo.basic_info.is_upcoming),
        isLive: videoInfo.basic_info.is_live,
        isLiveContent: videoInfo.basic_info.is_live_content,
        isUpcoming: videoInfo.basic_info.is_upcoming,
        games: videoInfo.game_info?.title.text,
        viewCount: videoInfo.basic_info.view_count,
        startDatetime: startDatetime,
        endDatetime: endDatetime,
        category: videoInfo.basic_info.category,
        videoId: videoId,
        seconds: seconds,
      };
    } catch (error) {
      console.error(`Error fetching video info for ${videoId}:`, error);
      return null;
    }
  }));

  return details.filter(detail => detail !== null);
};

// 実行部分
(async () => {
  const tags = [process.argv[2], process.argv[3]];
  const list = createCreators();

  const creators = list.filter(l => tags.every(item => l.tag.includes(item)));
  console.log(creators);
  const browser = await puppeteer.launch({
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 3000 });

  for (const creator of creators) {
    const data = await getDetail(page, creator);
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(`./data/${creator.channelTag}.json`, json);
  }

  await browser.close();
})();
