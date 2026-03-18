export const SAMPLE_DOCUMENT_TITLE = "手術後生活に関する説明書";

export const sampleDocumentHtml = `
  <article class="mock-document">
    <header class="mock-document__header">
      <p class="mock-document__eyebrow">説明資料</p>
      <h1 class="mock-document__title">手術後生活に関する説明書</h1>
      <p class="mock-document__lead">
        この資料では、これから開始するお薬の服用方法や生活注意点についてまとめています。
        オンラインでの説明を補完するために、重要な項目を順に確認してください。
      </p>
    </header>

    <section id="section-side-effects" class="mock-document__section">
      <h2>副作用について</h2>
      <p>
        一般的な副作用として、軽い吐き気、眠気、口の渇きなどが出ることがあります。
        これらは数日で落ち着く場合が多いですが、症状が続く場合は医師へ連絡してください。
      </p>
      <p>
        強い痛みや発熱、呼吸苦などの症状がある場合は、自己判断せずにすぐ連絡してください。
      </p>
      <ul>
        <li>軽度の副作用が出る可能性があります</li>
        <li>症状が強い場合は受診を検討してください</li>
        <li>気になる症状があれば遠慮なく相談してください</li>
      </ul>
    </section>

    <section id="section-medication-schedule" class="mock-document__section">
      <h2>服薬スケジュール</h2>
      <p>
        このお薬は、朝食後と夕食後の1日2回、決められた量を服用してください。
        飲み忘れを防ぐため、毎日同じ時間帯に服用することが大切です。
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
        治療期間中は、刺激の強い食品やアルコールの摂取を控えてください。
        体調に変化がある場合は、食事内容を記録して相談時に共有してください。
      </p>
      <ul>
        <li>過度な飲酒は避けてください</li>
        <li>刺激物の摂取は控えめにしてください</li>
        <li>体調不良時は無理せず相談してください</li>
      </ul>
    </section>

    <section id="section-emergency-contact" class="mock-document__section">
      <h2>緊急時の連絡</h2>
      <p>
        強い症状、急激な体調悪化、転倒などが起きた場合は、救急相談窓口へ連絡してください。
        連絡の際は、現在の症状と服用中の薬剤名を伝えてください。
      </p>
      <div class="mock-document__figure" aria-label="緊急連絡先図">
        <div class="mock-document__figure-box">
          <p>緊急連絡先図</p>
          <p>日中: 外来窓口 / 夜間・休日: 救急相談窓口</p>
        </div>
      </div>
    </section>
  </article>
`.trim();

export const SAMPLE_DOCUMENT_HTML = sampleDocumentHtml;
