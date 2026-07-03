from __future__ import annotations

import streamlit as st


def inject_css() -> None:
    st.markdown(
        """
        <style>
        :root {
          --hc-green: #2F5D50;
          --hc-teal: #6BB7A8;
          --hc-blue: #4C78A8;
          --hc-orange: #E6A15C;
          --hc-purple: #8E7DBE;
          --hc-bg: #F7FAF8;
          --hc-card: #FFFFFF;
          --hc-text: #1F2A24;
          --hc-muted: #6B756D;
          --hc-border: #DDE7E1;
          --hc-warning: #C58A3A;
          --hc-error: #B85C5C;
          --hc-success: #4F8F6B;
        }

        .stApp {
          background:
            radial-gradient(circle at 12% 18%, rgba(107, 183, 168, 0.18), transparent 28%),
            linear-gradient(135deg, #F7FAF8 0%, #EFF7F3 52%, #F8FAFD 100%);
          color: var(--hc-text);
        }

        .main .block-container {
          max-width: 1240px;
          padding: 1.25rem 2.2rem 4rem;
        }

        section[data-testid="stSidebar"] {
          background: rgba(255, 255, 255, 0.82);
          border-right: 1px solid var(--hc-border);
          width: 245px !important;
          min-width: 245px !important;
        }

        section[data-testid="stSidebar"] .block-container {
          padding-top: 1.2rem;
        }

        h1, h2, h3, label {
          color: var(--hc-text);
          letter-spacing: 0;
        }

        div[data-testid="stMarkdownContainer"] p {
          color: var(--hc-muted);
        }

        .hc-side-title {
          font-size: 1.08rem;
          font-weight: 780;
          color: var(--hc-green);
          margin-bottom: 0.2rem;
        }

        .hc-side-note {
          color: var(--hc-muted);
          font-size: 0.78rem;
          line-height: 1.45;
        }

        .hc-hero {
          min-height: 360px;
          padding: 2.1rem;
          border: 1px solid var(--hc-border);
          border-radius: 14px;
          background:
            linear-gradient(120deg, rgba(255, 255, 255, 0.95), rgba(247, 250, 248, 0.92)),
            repeating-linear-gradient(90deg, rgba(47, 93, 80, 0.035) 0, rgba(47, 93, 80, 0.035) 1px, transparent 1px, transparent 42px);
          box-shadow: 0 20px 50px rgba(47, 93, 80, 0.09);
        }

        .hc-eyebrow,
        .hc-breadcrumb,
        .hc-step-kicker {
          color: var(--hc-teal);
          font-size: 0.78rem;
          font-weight: 780;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .hc-hero h1 {
          margin: 0.35rem 0 0.4rem;
          color: var(--hc-green);
          font-size: clamp(2.4rem, 5vw, 4rem);
          line-height: 1.02;
        }

        .hc-hero-subtitle {
          font-size: 1.18rem;
          color: var(--hc-text) !important;
          margin-bottom: 0.7rem;
        }

        .hc-hero-copy {
          max-width: 760px;
          font-size: 1rem;
          line-height: 1.65;
        }

        .hc-plate-wrap {
          min-height: 360px;
          padding: 1.4rem;
          border: 1px solid var(--hc-border);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.8);
          box-shadow: 0 18px 42px rgba(47, 93, 80, 0.07);
        }

        .hc-plate-title {
          color: var(--hc-green);
          font-weight: 760;
          margin-bottom: 1rem;
        }

        .hc-plate-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 0.42rem;
        }

        .hc-plate-grid span {
          aspect-ratio: 1;
          border-radius: 999px;
          background: #E8F4EF;
          border: 1px solid #D5E8E0;
          box-shadow: inset 0 1px 2px rgba(47, 93, 80, 0.07);
        }

        .hc-plate-grid span.hc-well-green {
          background: #E8F4EF;
          border-color: #D5E8E0;
        }

        .hc-plate-grid span.hc-well-warm {
          background: #F8EFE4;
          border-color: #D5E8E0;
        }

        .hc-plate-grid span.hc-well-blue {
          background: #DDEBF7;
          border-color: #CDE1EE;
          box-shadow: inset 0 1px 2px rgba(47, 93, 80, 0.07);
        }

        .hc-section-heading {
          margin: 1.5rem 0 0.75rem;
        }

        .hc-section-heading h2 {
          margin: 0;
          color: var(--hc-green);
          font-size: 1.14rem;
          font-weight: 780;
        }

        .hc-section-heading p {
          margin: 0.25rem 0 0;
          font-size: 0.9rem;
          color: var(--hc-muted);
        }

        .hc-feature-card,
        .hc-module-header,
        .hc-step-card,
        .hc-info-card,
        .hc-kpi,
        .hc-history-card {
          border: 1px solid var(--hc-border);
          border-radius: 12px;
          background: var(--hc-card);
          box-shadow: 0 12px 30px rgba(47, 93, 80, 0.06);
        }

        .hc-feature-card {
          min-height: 205px;
          padding: 1.1rem;
          margin-bottom: 0.65rem;
          position: relative;
          overflow: hidden;
        }

        .hc-accent-line {
          width: 48px;
          height: 4px;
          border-radius: 99px;
          margin-bottom: 1rem;
          background: var(--hc-teal);
        }

        .hc-accent-teal .hc-accent-line { background: var(--hc-teal); }
        .hc-accent-bluegreen .hc-accent-line { background: linear-gradient(90deg, var(--hc-blue), var(--hc-teal)); }
        .hc-accent-blueorange .hc-accent-line { background: linear-gradient(90deg, var(--hc-blue), var(--hc-orange)); }
        .hc-accent-purpleteal .hc-accent-line { background: linear-gradient(90deg, var(--hc-purple), var(--hc-teal)); }
        .hc-accent-greenblue .hc-accent-line { background: linear-gradient(90deg, var(--hc-green), var(--hc-blue)); }

        .hc-feature-card h3 {
          margin: 0 0 0.5rem;
          font-size: 1.08rem;
          color: var(--hc-text);
        }

        .hc-feature-card p,
        .hc-history-card p {
          margin: 0;
          color: var(--hc-muted);
          font-size: 0.88rem;
          line-height: 1.5;
        }

        .hc-tags {
          display: flex;
          gap: 0.42rem;
          flex-wrap: wrap;
          margin-top: 0.9rem;
        }

        .hc-tag {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.24rem 0.55rem;
          font-size: 0.72rem;
          font-weight: 680;
          color: var(--hc-green);
          background: #EEF7F4;
          border: 1px solid #D8EBE5;
          white-space: nowrap;
        }

        .hc-breadcrumb {
          margin-bottom: 0.75rem;
        }

        .hc-module-header {
          display: flex;
          justify-content: space-between;
          gap: 1.2rem;
          align-items: flex-start;
          padding: 1.35rem 1.45rem;
          margin-bottom: 1.1rem;
        }

        .hc-module-header h1 {
          margin: 0 0 0.4rem;
          color: var(--hc-green);
          font-size: 2rem;
          line-height: 1.08;
        }

        .hc-module-header p {
          max-width: 840px;
          margin: 0;
          line-height: 1.55;
        }

        .hc-mode-pill {
          min-width: 210px;
          border: 1px solid #D8EBE5;
          border-radius: 12px;
          background: #F4FBF8;
          padding: 0.85rem;
        }

        .hc-mode-pill span {
          display: block;
          color: var(--hc-muted);
          font-size: 0.74rem;
          margin-bottom: 0.25rem;
        }

        .hc-mode-pill strong {
          color: var(--hc-green);
          font-size: 0.92rem;
        }

        .hc-step-card {
          padding: 0.95rem 1rem;
          margin: 1.05rem 0 0.8rem;
        }

        .hc-step-card h2 {
          margin: 0.15rem 0 0;
          font-size: 1.05rem;
          color: var(--hc-green);
        }

        .hc-step-card p {
          margin: 0.25rem 0 0;
          font-size: 0.86rem;
        }

        .hc-info-card {
          padding: 0.85rem 1rem;
          margin: 0.7rem 0;
          color: var(--hc-muted);
          line-height: 1.48;
        }

        .hc-info-card strong {
          display: block;
          color: var(--hc-green);
          margin-bottom: 0.25rem;
        }

        .hc-success { border-color: #CFE7D8; background: #F3FAF5; }
        .hc-success strong, .hc-success div { color: var(--hc-success); }
        .hc-warning { border-color: #F0D9AF; background: #FFF9EF; }
        .hc-warning strong, .hc-warning div { color: var(--hc-warning); }
        .hc-error { border-color: #EDCBCB; background: #FFF5F5; }
        .hc-error strong, .hc-error div { color: var(--hc-error); }

        .hc-file-pill {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
          padding: 0.62rem 0.75rem;
          border: 1px solid var(--hc-border);
          border-radius: 10px;
          background: #FBFDFB;
          color: var(--hc-muted);
          font-size: 0.84rem;
          margin: 0.35rem 0;
        }

        .hc-file-pill strong { color: var(--hc-text); }
        .hc-file-pill code { color: var(--hc-green); white-space: normal; }

        .hc-kpi {
          padding: 0.85rem;
          min-height: 78px;
        }

        .hc-kpi .label {
          color: var(--hc-muted);
          font-size: 0.75rem;
        }

        .hc-kpi .value {
          color: var(--hc-green);
          font-size: 1.02rem;
          font-weight: 780;
          margin-top: 0.2rem;
          overflow-wrap: anywhere;
        }

        .hc-history-card {
          padding: 1rem;
          margin: 0.65rem 0 0.35rem;
          display: grid;
          grid-template-columns: minmax(210px, 0.75fr) minmax(260px, 1.25fr);
          gap: 1rem;
        }

        .hc-history-card h3 {
          margin: 0.45rem 0 0.2rem;
          font-size: 0.98rem;
          color: var(--hc-text);
          overflow-wrap: anywhere;
        }

        .hc-pdf-preview {
          display: block;
          width: min(60%, 980px);
          height: 620px;
          margin: 1.1rem auto 0;
          border: 1px solid var(--hc-border);
          border-radius: 12px;
          background: #FFFFFF;
          box-shadow: 0 12px 30px rgba(32, 55, 52, 0.08);
        }

        @media (max-width: 900px) {
          .hc-pdf-preview {
            width: 92%;
          }
        }

        div.stButton > button,
        div.stDownloadButton > button {
          border-radius: 10px;
          border: 1px solid #CFE1DA;
          background: #FFFFFF;
          color: var(--hc-green);
          font-weight: 700;
          box-shadow: 0 2px 8px rgba(47, 93, 80, 0.05);
        }

        div.stButton > button[kind="primary"] {
          background: var(--hc-green);
          color: #FFFFFF;
          border-color: var(--hc-green);
        }

        div.stButton > button:hover,
        div.stDownloadButton > button:hover {
          border-color: var(--hc-teal);
          color: var(--hc-green);
          background: #F4FBF8;
        }

        div[data-testid="stFileUploader"] {
          border: 1px dashed #C9DDD4;
          border-radius: 12px;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.72);
        }

        div[data-testid="stExpander"] {
          border: 1px solid var(--hc-border);
          border-radius: 12px;
          background: #FFFFFF;
        }

        div[data-testid="stDataFrame"] {
          border: 1px solid var(--hc-border);
          border-radius: 12px;
          overflow: hidden;
        }

        .stTabs [data-baseweb="tab-list"] { gap: 0.35rem; }

        .stTabs [data-baseweb="tab"] {
          border-radius: 10px;
          border: 1px solid var(--hc-border);
          background: #FFFFFF;
          color: var(--hc-muted);
        }

        @media (max-width: 900px) {
          .main .block-container {
            padding-left: 1rem;
            padding-right: 1rem;
          }

          .hc-module-header,
          .hc-history-card {
            grid-template-columns: 1fr;
            display: block;
          }

          .hc-mode-pill {
            margin-top: 1rem;
          }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
