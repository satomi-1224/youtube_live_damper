const { Innertube } = require('youtubei.js');
const fs = require('fs');
const dayjs = require('dayjs');

// jsonをすべて結合
const createCreators = () => {
    const hololive = require('./creators/hololive.json');
    const nijisanji = require('./creators/nijisanji.json');
    
    return hololive.concat(nijisanji);
}
const creators = createCreators();

// レスポンスが標準時なので、９時間プラスして日本時間にする
const changeJaDatetime = (datetime) => {
    return dayjs(datetime).add(9, 'hour').toDate();
}

// ライブが配信中なのか配信予定なのか配信済みなのかを判定
const status = (isLive, isUpcoming) => {
    if (isLive) {
        return 'live'
    } else {
        if (isUpcoming) {
            return 'upcoming';
        } else {
            return 'completed';
        }
    }
}

// チャンネル情報を取得
const getChannel = async (channelTag) => {
    // console.log(channelTag);
    const youtube = await Innertube.create();
    const creator = creators.find(element => element.channelTag === channelTag);
    // console.log(creator.name);
    const channelId = creator.channelId
    const channel = await youtube.getChannel(channelId);
    // console.log(channel.header.author);
    const live = await channel.getLiveStreams();
    const contents = live.current_tab.content.contents;
    const filteredContents = contents.map(content => content.content);
    const datas = [];
    let i = 0;
    for (const filteredContent of filteredContents) {
        i++;
        // console.log(i);
        if (filteredContent == null) break;
        const videoInfo = await youtube.getInfo(filteredContent.id);
        const seconds = filteredContent.duration.seconds;
        const startDatetime = changeJaDatetime(videoInfo.basic_info.start_timestamp);
        const endDatetime = dayjs(startDatetime).add(seconds, 'second').toDate();
        const isLive = videoInfo.basic_info.is_live;
        const isUpcoming = videoInfo.basic_info.is_upcoming;
        const videoId = filteredContent.endpoint.metadata.url?.replace('/watch?v=', '');
        const data = {
            creator: {
                channelId: channel.header.author.id,
                channelTag: creator.channelTag,
                channelName: channel.header.author.name,
                channelUrl: channel.header.author.url,
                channelIcon: channel.header.author.thumbnails[0].url,
                tag: creator.tag
            },
            id: videoInfo.basic_info.id,
            title: videoInfo.basic_info.title,
            thumbnail: videoInfo.basic_info.thumbnail[0].url,
            status: status(isLive, isUpcoming),
            isLive: isLive,
            isLiveContent: videoInfo.basic_info.is_live_content,
            isUpcoming: isUpcoming,
            games: videoInfo.game_info?.title.text,
            viewCount: videoInfo.basic_info.view_count,
            startDatetime: startDatetime,
            endDatetime: endDatetime,
            category: videoInfo.basic_info.category,
            videoId: videoId,
            seconds: seconds
        };
        // console.log(data);
        datas.push(data);
    }
    const json = JSON.stringify(datas, null, 2);
    fs.writeFileSync(`./datas/${creator.channelTag}.json`, json);
}

// 以降cronで実行する際に叩かれる部分
const channelTag = process.argv[2];
getChannel(channelTag);
