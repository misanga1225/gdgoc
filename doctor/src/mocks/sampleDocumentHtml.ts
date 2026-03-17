export const SAMPLE_DOCUMENT_TITLE = "内服治療開始に関するご説明";

export const sampleDocumentHtml = `
  <article class="mock-document">
    <header class="mock-document__header">
      <p class="mock-document__eyebrow">説明資料</p>
      <h1 class="mock-document__title">内服治療開始に関するご説明</h1>
      <p class="mock-document__lead">
        この資料は、これから開始するお薬の服用方法や注意点についてまとめたものです。
        オンラインでのご説明を補助するために、重要な内容を項目ごとに整理しています。
        ご不明な点がある場合は、診察中に遠慮なくご相談ください。
      </p>
    </header>

    <section id="section-side-effects" class="mock-document__section">
      <h2>副作用について</h2>
      <p>
        お薬の服用により、眠気、軽い吐き気、胃の不快感、口の渇きなどの症状が出ることがあります。
        これらは比較的よくみられる症状で、服用開始後しばらくして落ち着くことがあります。
      </p>
      <p>
        一方で、強い発疹、息苦しさ、強いめまい、意識がぼんやりするなどの症状がある場合は、
        服用を続けず、できるだけ早く医療機関へご相談ください。
      </p>
      <ul>
        <li>軽い眠気や胃の不快感が出ることがあります</li>
        <li>症状が強い場合は自己判断せずご相談ください</li>
        <li>急な体調変化がある場合は早めの連絡が必要です</li>
      </ul>
    </section>

    <section id="section-medication-schedule" class="mock-document__section">
      <h2>服薬スケジュール</h2>
      <p>
        このお薬は、朝食後と夕食後の1日2回、決められた量を服用してください。
        毎日なるべく同じ時間帯に服用することで、お薬の効果が安定しやすくなります。
      </p>
      <p>
        飲み忘れに気づいた場合は、次の服用時間が近いときは1回分を飛ばし、2回分をまとめて飲まないでください。
        対応に迷う場合は、受診先または薬局にご相談ください。
      </p>
      <div class="mock-document__figure" aria-label="服薬スケジュール図">
        <div class="mock-document__figure-box">
          <p>服薬スケジュール図</p>
          <p>朝食後 1回 / 夕食後 1回</p>
        </div>
      </div>
    </section>

    <section id="section-dietary-restrictions" class="mock-document__section">
      <h2>食事制限</h2>
      <p>
        服用期間中は、刺激の強い食品や過度の飲酒を控えてください。
        胃に負担がかかりやすくなる場合があるため、食事はできるだけ規則的にとることをおすすめします。
      </p>
      <p>
        水分はこまめに摂取し、体調がすぐれないときは無理をしないようにしてください。
        サプリメントや市販薬を併用する場合は、あらかじめ医師または薬剤師へ確認してください。
      </p>
      <ul>
        <li>過度の飲酒は避けてください</li>
        <li>刺激物のとりすぎに注意してください</li>
        <li>併用薬がある場合は事前に確認してください</li>
      </ul>
    </section>

    <section id="section-emergency-contact" class="mock-document__section">
      <h2>緊急時の連絡</h2>
      <p>
        強い息苦しさ、意識の低下、広い範囲の発疹、高熱を伴う体調不良などがある場合は、
        受診予約日を待たずに、速やかに医療機関へご連絡ください。
      </p>
      <p>
        夜間や休日で通常の連絡先につながらない場合は、案内された緊急連絡先をご利用ください。
        症状が急激に悪化している場合は、救急相談窓口の利用も検討してください。
      </p>
      <div class="mock-document__figure" aria-label="連絡先案内図">
        <div class="mock-document__figure-box">
          <p>連絡先案内図</p>
          <p>平日 daytime: 外来窓口 / 夜間・休日: 緊急連絡先</p>
        </div>
      </div>
    </section>
  </article>
`.trim();

// Backward-compatible alias used by existing D-05 mock page.
export const SAMPLE_DOCUMENT_HTML = sampleDocumentHtml;
