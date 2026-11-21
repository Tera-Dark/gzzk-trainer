import type { Subject } from './types'

export interface WritingSection {
  id: string
  title: string
  md: string
}

export interface WritingDoc {
  id: string
  title: string
  subject: Subject
  color: string
  tagline: string
  sections: WritingSection[]
}

export const WRITING_DOCS: WritingDoc[] = [
  {
    id: 'chinese',
    title: '语文作文素材',
    subject: 'chinese',
    color: '#ef4444',
    tagline: '审题 · 结构 · 素材 · 金句 · 范文',
    sections: [
      {
        id: 'topics',
        title: '题目与审题',
        md: `### 十年题目看趋势

广州的作文题，几乎都在写「我」和「我的生活」：

| 年份 | 题目 |
|---|---|
| 2025 | 我与我们 |
| 2024 | 那个教会我__的人（说谢谢 / 往前走 / 看见美） |
| 2023 | 一样的__，不一样的我 |
| 2022 | 我是如此地热爱__ |
| 2021 | 这里有我 |
| 2020 | 我能为你做点什么 |
| 2019 | 别担心，我可以的 |
| 2018 | 原来这么简单 |
| 2017 | 总会想起那张照片 |

规律是：**半命题为主，主角是「我」，落点在成长与真情**。与其背范文，不如先准备好 3–4 个「我自己的故事」，什么题目都能改装。

### 审题三步（3 分钟）

1. **圈关键词**：哪个词决定方向？（「教会」「不一样」「热爱」「有我」）
2. **定关系**：两个词之间是什么关系？比如「一样的__，不一样的我」——外面没变，变的是我的眼光和行动。
3. **写一句立意**：一句话说清「我原来……后来……因为我明白了……」。

- 例：《我与我们》→「我原以为集体会磨掉个性，后来在合唱排练里发现，正是每个人不同的声音撑起了一个和声。」

### 半命题补题三招

- **填具体动作**：别写「热爱生活」，写「热爱听雨砸在铁皮棚上的声音」。
- **填小物件、小场景**：巷口的糖水铺、阳台的旧藤椅、校门口那棵榕树。
- **别填抽象大词**：青春、成长、理想——一填就空。`,
      },
      {
        id: 'structure',
        title: '结构与提纲',
        md: `### 记叙文：六段式（600–800 字最稳）

| 段 | 作用 | 字数 |
|---|---|---|
| 起 | 一个具体场景切入 | 80 |
| 承 | 交代人与事、我的初始态度 | 120 |
| 转 | 关键的一件事，写细：动作、对话、环境 | 220 |
| 顿 | 我的心理变化，一句自我质问 | 120 |
| 合 | 回扣题目关键词，点明我变成了什么样 | 120 |
| 收 | 一个画面收尾，不喊口号 | 60 |

### 让文章有细节的四把钥匙

- **五感**：气味、声音、温度最容易被忽略，也最出彩。
- **小动作**：奶奶把糖水推过来之前，先用袖口擦了擦桌沿。
- **对话只留一句**：一句原话胜过三句转述。
- **时间标记**：那天是六月，风扇转得很慢。

### 三个常见的扣分点

1. 开头大段排比、结尾大段抒情，中间只有三行故事。
2. 全篇都是「我们应该」，没有一个「我」。
3. 把一天写成流水账：七点起床、八点出门，只留关键那一件就够了。`,
      },
      {
        id: 'materials',
        title: '素材库（八类）',
        md: `素材不是拿来抄的，是拿来**唤起你自己记忆**的。每类记住两个画面就够用。

### 成长与挫折

- 长跑最后一圈、数学从 62 到 90 的那次订正、第一次上台忘词。
- 可用句：**原来所谓长大，不是忽然变强，而是摔倒之后，愿意自己站起来拍掉裤子上的灰。**

### 亲情与陪伴

- 深夜留的一盏灯、门口等我时手里那袋还温着的糖水、父亲修了三次的台灯。
- 可用句：**他们把爱做成了日常，所以我一直没看见。**

### 师生与同伴

- 老师在本子上画的一个小勾、同桌把橡皮掰成两半、运动会上递来的半瓶水。
- 可用句：**有些人的好是安静的，安静到要很多年之后才听见。**

### 广府与传统文化

- 早茶的一盅两件、骑楼下的凉茶铺、粤剧私伙局的锣鼓、龙舟鼓点、镬耳墙、木棉花。
- 可用句：**一座城市的性格，藏在它最日常的吃食和口音里。**

### 科技与时代

- 老人学用手机扫码、AI 帮我改作文、无人机给荔枝林打药、地铁里人人低头。
- 可用句：**技术把距离缩短了，可有些距离还得靠人一步步走近。**

### 自然与美

- 台风过境后的满地落叶、雨后的白兰花香、操场边年年开花的凤凰木。
- 可用句：**美并不稀缺，稀缺的是停下来看它的那几十秒。**

### 劳动与实践

- 第一次做一顿饭、社区志愿扫街、帮外公收荔枝、给班上出黑板报。
- 可用句：**手上有过活儿的痕迹，讲道理的时候才会踏实。**

### 阅读与书香

- 一本书里划过的句子、图书馆靠窗的位置、抄在本子上的诗。
- 可用句：**读书不是逃离生活，是给生活多备一双眼睛。**`,
      },
      {
        id: 'quotes',
        title: '金句 · 开头 · 结尾',
        md: `### 开头四式（各 60 字内）

- **场景式**：六月的风把教室后窗吹得咣当响，我盯着卷子上那个鲜红的 62，第一次觉得数字也会烫手。
- **对话式**：「你真的要去？」同桌把笔一放，抬眼看我。
- **物件式**：那把藤椅还在阳台上，扶手上有一道被磨白的痕。
- **反差式**：我一直以为，我们班最不可能哭的人是体育委员。

### 结尾三式

- **画面收束**：走出校门时天已经暗了，路灯一盏一盏亮起来，像有人替我们把路铺好。
- **回扣题目**：原来一样的街、一样的人，只是我学会了抬头。
- **留白**：我没有回答，只是把那张纸折好，放进了口袋。

### 可背的短句（改写后再用）

> 慢一点，也是一种抵达。

> 被爱过的人，身上有光。

> 所有的笨拙，都是认真留下的形状。

> 我们终其一生，都在学习如何好好说话。

> 日子不是过给别人看的，是一寸一寸自己走出来的。

> 有些告别没有声音，等你回头，它已经走了很远。

> 一个人真正的底气，来自他做成过一件小事。

> 世界很大，但值得记住的，往往只有几个人、几条街。`,
      },
      {
        id: 'model',
        title: '示例范文',
        md: `### 《我与我们》（2025 广州题）

> 这是按中考评分要点写的示范。读它的结构，不要背句子。

合唱排练的第一天，我差点摔门出去。

音乐老师把四十个人排成四排，说：「从今天起，你们不是四十个人，是一个声音。」我站在第二排最边上，心里冷笑：一个声音？我练了六年钢琴，凭什么要被隔壁那个总跑调的男生拖慢？

第一次合排，果然乱成一锅粥。我唱得很准，声音却像一根刺，扎在所有人的和声外面。老师停下来，没有批评谁，只说了一句：「你唱得没错，但你没在听。」

那句话让我一整晚没睡好。第二个星期，我试着把耳朵张开：听左边女生的气口，听后排男生的低音，听钢琴前奏里那一小节渐强。我第一次发现，原来「准」不等于「对」——一个人的准确，放进一群人里可能只是突兀。

真正让我改变的是彩排那天。唱到第二段副歌，领唱突然嗓子哑了，声音卡在最高音上。台下有窸窣的响动。我不知道哪来的勇气，把她的那句接了下来，声音不大，但稳。后面几排的人跟上来，和声像水一样漫过整个礼堂。下台时，领唱红着眼跟我说谢谢，我摆摆手，心里却在想：刚才那一下，不是我一个人唱完的。

演出那天，灯光亮起，我看见台下黑压压的人头。前奏响起，四十个人一起吸气，那口气整齐得让人心里发烫。我忽然明白老师说的「一个声音」——不是所有人唱得一样，而是每个人都知道自己在哪一层，愿意为别人让出半拍。

我叫「我」，可我从没单独存在过。我的准确、我的倔、我那点不甘心，都要放进「我们」里，才终于有了回响。

那天散场，走廊的灯一盏一盏灭下去。我听见身后还有人在轻轻哼那段副歌，跑调，却很好听。

**这篇为什么能拿分**：开头有场景有冲突；中间一件事写透（合排—被点醒—救场）；「我」的态度有明确转变；结尾回扣题目，用画面收，不喊口号。`,
      },
    ],
  },
  {
    id: 'english',
    title: '英语作文素材',
    subject: 'english',
    color: '#f59e0b',
    tagline: '框架 · 句型 · 话题词块 · 范文',
    sections: [
      {
        id: 'rules',
        title: '评分与卷面',
        md: `### 书面表达看什么

- **要点齐全**：题目给的提示点一条都不能漏，漏一条就掉一档。
- **语言准确**：时态、主谓一致、单复数、拼写。低级错误最伤分。
- **连贯**：有连接词，句子之间有逻辑。
- **卷面**：字迹清楚、分三段、少涂改。

字数一般 80 词左右（以当年试卷要求为准）。**宁可短而准，不要长而错。**`,
      },
      {
        id: 'frame',
        title: '三段式框架',
        md: `### 每段干什么

| 段 | 作用 | 常用开头 |
|---|---|---|
| ① | 点题、交代背景 | I am writing to ... / I'd like to share ... |
| ② | 展开 2–3 个要点 | First ... Besides ... What's more ... |
| ③ | 总结、希望、感谢 | In a word ... / I hope ... / Looking forward to ... |

### 开头句（背五句就够）

- I am writing to invite you to our school's English Festival.
- I'd like to share something about how I keep healthy.
- As we all know, protecting the environment is everyone's duty.
- Recently our class had a discussion on whether students should bring phones to school.
- Thank you for your letter. I'm glad to tell you about my life in Guangzhou.

### 过渡与连接

- 递进：besides / what's more / not only ... but also
- 转折：however / although / instead
- 因果：because / so / as a result / that's why
- 举例：for example / such as / take ... as an example
- 总结：in a word / in short / all in all

### 结尾句

- I hope you will find these suggestions useful.
- Let's take action from now on.
- I'm looking forward to your early reply.
- With everyone's effort, I believe our city will be more beautiful.`,
      },
      {
        id: 'topics',
        title: '高频话题素材',
        md: `每组记 5 个词块 + 2 个句子，考场上换主语就能用。

### 校园与学习

- 词块：after-school activities, take part in, improve my spoken English, make progress, deal with stress
- Taking part in the English club has helped me speak more confidently.
- Instead of studying all day, we should learn to plan our time wisely.

### 健康与运动

- 词块：keep fit, balanced diet, stay up late, physical exercise, mental health
- An hour of exercise every day keeps both my body and my mind healthy.
- Going to bed early is the easiest way to feel better tomorrow.

### 环保与低碳

- 词块：reduce waste, sort rubbish, save energy, plastic bags, low-carbon life
- Small actions, such as bringing a reusable bag, can make a real difference.
- If everyone sorts rubbish properly, our city will be much cleaner.

### 传统文化与广州

- 词块：traditional culture, Cantonese opera, dim sum, pass down, be proud of
- Morning tea is not just food; it is a way for Cantonese people to stay together.
- As a student in Guangzhou, I feel proud to help pass down our local culture.

### 科技与手机

- 词块：smartphone, online learning, spend too much time on, use ... properly, convenience
- The Internet brings us convenience, but it can also take away our time.
- We should learn to use our phones properly instead of being controlled by them.

### 志愿服务与感恩

- 词块：volunteer, help others, give a hand, be thankful to, community service
- Helping others is not about doing big things but about doing small things warmly.
- I want to say thank you to those who have quietly supported me.`,
      },
      {
        id: 'upgrade',
        title: '升级表达',
        md: `### 替换表

| 普通说法 | 升级说法 |
|---|---|
| very good | excellent / wonderful |
| very important | of great importance |
| I think | In my opinion / Personally |
| many students | a large number of students |
| get better | make progress |
| help me a lot | be of great help to me |
| because | That is why ... |
| I like it very much | I am really fond of it |

### 最容易丢分的五处

1. **时态混用**：讲过去的事，全篇过去时。
2. **主谓不一致**：My friend like ... 应为 likes。
3. **可数名词没复数**：many student 应为 students。
4. **中式表达**：I very like it 应为 I like it very much。
5. **一句两个谓语**：I think it is good is important。`,
      },
      {
        id: 'model',
        title: '范文两篇',
        md: `### 范文一 · 邀请信（约 85 词）

Dear Tom,

I am writing to invite you to our school's Culture Festival, which will be held in the school hall next Friday afternoon.

There will be many interesting activities. First, students will put on a short play about Cantonese opera. Besides, you can try making dim sum with us. What's more, a photo show will tell you the story of our city.

I'm sure you will enjoy it. Please let me know if you can come.

Yours,
Li Hua

**点评**：要点齐全（时间地点、活动一、活动二、邀请回应），每段一个功能，连接词清楚。

### 范文二 · 观点类（约 90 词）

Recently our class had a discussion on whether students should bring phones to school.

Some students think phones are useful. They can look up new words and keep in touch with their parents. However, others disagree. They say some students play games in class and pay less attention to their lessons.

In my opinion, we should use phones properly. We can bring them but keep them off during class. After all, a phone is a tool, not a toy.

**点评**：正反各一句、观点明确、结尾一句收住，是最稳的结构。`,
      },
    ],
  },
  {
    id: 'politics',
    title: '道法小论文',
    subject: 'politics',
    color: '#ec4899',
    tagline: '观点 · 四段式 · 论点论据 · 范文',
    sections: [
      {
        id: 'what',
        title: '评分标准',
        md: `### 小论文（材料论述题）在考什么

一般 6–10 分，老师看四件事：

1. **观点明确**：第一段就要有一句能站住的观点，不要绕。
2. **论据充分**：每个分论点配「教材道理 + 具体事例或数据」。
3. **逻辑清楚**：分点分层，用「首先 / 其次 / 最后」。
4. **联系实际**：最后落到「作为中学生，我可以……」。`,
      },
      {
        id: 'structure',
        title: '四段式模板',
        md: `### 引 — 议 — 联 — 结

| 段 | 写法 | 字数 |
|---|---|---|
| 引 | 概述材料 + 亮明观点 | 40–60 |
| 议 | 2–3 个分论点，每点「观点句 + 教材依据 + 例子」 | 150–200 |
| 联 | 联系国家、社会、青少年实际 | 60–100 |
| 结 | 回扣观点，一句有力的话收尾 | 30–50 |

**观点句怎么写**：主谓宾，不超过 30 字。例：「创新是引领发展的第一动力。」`,
      },
      {
        id: 'materials',
        title: '论点论据库',
        md: `### 一、爱国主义与民族团结

- 观点：国家统一、民族团结，是各族人民共同的根本利益所在。
- 依据：我国是统一的多民族国家；维护国家统一和民族团结是公民的基本义务。
- 例子：各族群众共同脱贫的乡村、援疆援藏干部、两岸民间交流。

### 二、创新与科技

- 观点：创新是引领发展的第一动力，是民族进步的灵魂。
- 依据：创新驱动发展战略；教育、科技、人才是基础性、战略性支撑。
- 例子：国产大飞机、嫦娥探月、北斗导航、人工智能大模型。

### 三、生态文明

- 观点：绿水青山就是金山银山，保护环境就是保护生产力。
- 依据：人与自然和谐共生；节约资源和保护环境的基本国策；可持续发展。
- 例子：垃圾分类、河长制、塞罕坝林场、珠江禁渔期。

### 四、法治与规则

- 观点：法治是现代政治文明的核心，也是公民权利的保障。
- 依据：依法治国；法律面前人人平等；公民要学法尊法守法用法。
- 例子：未成年人保护法、反电信网络诈骗法、校园欺凌的依法处理。

### 五、劳动与奋斗

- 观点：劳动是财富的源泉，也是幸福的源泉。
- 依据：劳动创造价值；实干兴邦；青年在奋斗中实现人生价值。
- 例子：大国工匠、外卖骑手、社区志愿者、暑假社会实践。

### 六、文化自信

- 观点：文化自信是更基本、更深沉、更持久的力量。
- 依据：中华优秀传统文化、革命文化、社会主义先进文化；创造性转化、创新性发展。
- 例子：粤剧进校园、博物馆热、国潮设计、广交会上的中国品牌。`,
      },
      {
        id: 'sentences',
        title: '万能句',
        md: `### 论证句

- 材料中的……告诉我们，……不是可有可无的，而是……的前提。
- 一方面，……；另一方面，……。二者相辅相成，缺一不可。
- 正是因为……，我们才更加需要……。
- 从长远看，……比……更重要。
- 这不仅关系到个人成长，更关系到国家和民族的未来。
- 作为新时代的青少年，我们既要……，也要……。

### 结尾（挑一句改写）

> 蓝图已经绘就，奋斗正当其时。

> 一滴水只有放进大海才不会干涸，一个人只有融入时代才能走得更远。

> 我们能做的，不是等待一个更好的世界，而是从今天起，做那个让世界变好一点的人。`,
      },
      {
        id: 'model',
        title: '示例范文',
        md: `### 《人工智能时代，我们更需要怎样的能力》

材料中说，人工智能已经能写文章、画画、做翻译，有人担心自己会被取代。我认为，技术越强大，人越要守住那些机器学不会的能力。

首先，是独立思考的能力。人工智能给出的答案看起来完整，却可能不准确。材料中的例子提醒我们：如果只会复制答案，就等于把自己的判断交给了别人。只有学会追问「依据是什么」「还有没有别的可能」，我们才不会被信息牵着走。

其次，是提出问题的能力。机器擅长解决被清晰描述的问题，而发现一个真问题，需要好奇心和责任感。从袁隆平一定要找到那株天然杂交稻，到工程师坚持把安全性再提高一点，推动进步的往往不是答案，而是问题。

最后，是与人相处的能力。技术可以算出分数，却算不出一个同学低头时的难过。一句及时的安慰、一次主动的分担，是任何算法都无法替代的温暖。

当然，这不意味着可以拒绝技术。相反，我们要学会使用它、理解它，让工具为人的成长服务。

作为中学生，我现在能做的，是少一点「搜一下就好」，多一点自己想、自己写、自己问。人之所以为人，不在于算得比机器快，而在于知道为什么而算。`,
      },
      {
        id: 'tips',
        title: '考场提醒',
        md: `- **先列提纲再动笔**：观点、两个分论点、一个例子，30 秒够。
- **分点作答**：用「首先 / 其次 / 最后」，老师一眼能看到论点。
- **术语要准**：写教材原词（创新驱动、共同富裕、全过程人民民主），别自创概念。
- **别写满格**：留两行，结尾才收得住。
- **时间**：一道论述题不超过 10 分钟。`,
      },
    ],
  },
  {
    id: 'history',
    title: '历史小论文',
    subject: 'history',
    color: '#a16207',
    tagline: '观点 · 史实 · 论证句式 · 范文',
    sections: [
      {
        id: 'what',
        title: '评分标准',
        md: `### 历史小论文看五点

1. **观点**：能提炼一个明确、可论证的看法，不是复述材料。
2. **史实**：至少两个准确史实，时间、事件、人物不能错。
3. **论证**：说清「史实怎样证明观点」，不能只堆材料。
4. **结构**：总—分—总，分段清楚。
5. **升华**：结尾联系现实或历史规律。`,
      },
      {
        id: 'structure',
        title: '三段式结构',
        md: `### 亮观点 → 论证 → 结论

1. **亮观点**（1–2 句）：我认为……推动 / 说明了……。
2. **论证**（两个史实，每个三句）：史实 + 作用 + 小结。
3. **结论**（2 句）：由此可见……；今天……依然需要……。

### 论证一个史实，用这个句式

> 时间 + 主体 + 做了什么 + 产生了什么影响 + 这证明了……

例：「1978 年，安徽凤阳小岗村农民率先实行分田包干，粮食产量大幅提高，这证明生产关系适应生产力时，就能解放生产力。」`,
      },
      {
        id: 'facts',
        title: '史实素材库',
        md: `### 中国古代

- **制度创新**：秦朝郡县制、隋唐科举制、元朝行省制——可论证「制度创新巩固统一、促进社会流动」。
- **交流互鉴**：张骞通西域、丝绸之路、玄奘西行、鉴真东渡、郑和下西洋——可论证「开放交流推动文明繁荣」。
- **科技文化**：造纸术、印刷术、指南针、火药；唐诗、宋词、明清小说——可论证「文化自信来自长期积累与创新」。

### 中国近现代

- **救亡图存**：洋务运动、戊戌变法、辛亥革命、五四运动、抗日战争——可论证「民族觉醒是救亡图存的前提」。
- **道路选择**：中国共产党成立、井冈山道路、改革开放——可论证「适合国情的道路才能走通」。
- **建设成就**：两弹一星、杂交水稻、高铁、脱贫攻坚——可论证「自力更生与科技创新是国家底气」。

### 世界史

- **工业革命**：蒸汽机、工厂制度、铁路——可论证「技术革命改变社会结构」。
- **思想解放**：文艺复兴、启蒙运动、《共产党宣言》——可论证「思想解放是社会变革的先导」。
- **战争与和平**：两次世界大战、联合国、冷战结束——可论证「和平需要制度与共识来维护」。
- **全球化**：新航路开辟、世界贸易组织、一带一路——可论证「交流合作是发展的主流」。`,
      },
      {
        id: 'sentences',
        title: '论证句式',
        md: `### 常用句

- ……为……提供了物质基础 / 制度保障 / 思想条件。
- 从……到……，可以看出……是一个不断……的过程。
- 如果说……是前提，那么……就是关键。
- 这一变化不是偶然的，而是……的必然结果。
- 历史证明，凡是……，就……；凡是……，就……。
- 以史为鉴，今天我们推进……，仍然需要……。

### 结尾升华

> 历史的车轮从不为谁停留，但每一次回望，都是为了走得更稳。

> 一个民族对自己历史的了解有多深，走向未来的脚步就有多坚定。`,
      },
      {
        id: 'model',
        title: '示例范文',
        md: `### 《制度创新是社会进步的重要动力》

制度不是一成不变的条文，而是回应时代问题的答案。我认为，历史上每一次重大的制度创新，都为社会进步打开了新的空间。

秦统一后推行郡县制，废除分封，官吏由中央任免。这一变革把地方权力收归中央，使政令直达基层，为统一多民族国家的长期稳定奠定了基础。隋唐时期创立的科举制，以考试选官取代门第垄断，让寒门子弟有了上升通道，扩大了统治基础，也推动了文化教育的普及。到了 1978 年，安徽小岗村农民率先实行分田包干，家庭联产承包责任制随后推广，农民的生产积极性被调动起来，粮食产量显著提高。

从郡县制到科举制，再到家庭联产承包责任制，可以看出：制度创新之所以能推动社会进步，是因为它调整了人与人、人与国家之间的关系，让更多人的努力得到回报。

今天，我们推进国家治理体系和治理能力现代化，同样需要这种直面问题、勇于调整的智慧。制度活了，人的创造力才会活。`,
      },
      {
        id: 'tips',
        title: '考场提醒',
        md: `- **观点一定要写出来**，不要藏在叙述里。
- **史实宁少勿错**：记不清年份宁可不写年份。
- **别写流水账**：一个史实三句话，说清因果就停。
- **字数**：一般 200–300 字，写满不留白。
- **结构感**：分段 + 首句点题，阅卷老师 20 秒就能看懂你的逻辑。`,
      },
    ],
  },
]
