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
          background: var(--hc-bg);
          color: var(--hc-text);
        }

        .main .block-container {
          max-width: 1320px;
          padding: 1.6rem 2.4rem 4rem;
        }

        section[data-testid="stSidebar"] {
          background: #FFFFFF;
          border-right: 1px solid var(--hc-border);
        }

        section[data-testid="stSidebar"] .block-container {
          padding-top: 1.4rem;
        }

        h1, h2, h3, label {
          color: var(--hc-text);
          letter-spacing: 0;
        }

        div[data-testid="stMarkdownContainer"] p {
          color: var(--hc-muted);
        }

        .hc-app-title {
          font-size: 1.45rem;
          font-weight: 780;
          color: var(--hc-green);
          margin: 0 0 0.2rem;
          line-height: 1.1;
        }

        .hc-app-subtitle {
          font-size: 0.82rem;
          color: var(--hc-muted);
          line-height: 1.4;
          margin: 0 0 1rem;
        }

        .hc-sidebar-foot {
          margin-top: 2rem;
          padding: 0.85rem;
          border: 1px solid var(--hc-border);
          border-radius: 8px;
          background: #F7FAF8;
          color: var(--hc-muted);
          font-size: 0.78rem;
          line-height: 1.45;
        }

        .hc-header {
          padding: 1.4rem 1.5rem;
          border: 1px solid var(--hc-border);
          border-radius: 8px;
          background: linear-gradient(180deg, #FFFFFF 0%, #FBFDFB 100%);
          box-shadow: 0 12px 32px rgba(47, 93, 80, 0.06);
          margin-bottom: 1.1rem;
        }

        .hc-header h1 {
          margin: 0 0 0.35rem;
          font-size: clamp(1.8rem, 3vw, 2.45rem);
          line-height: 1.1;
          color: var(--hc-green);
        }

        .hc-header p {
          margin: 0;
          max-width: 920px;
          color: var(--hc-muted);
          font-size: 0.98rem;
          line-height: 1.55;
        }

        .hc-header .hc-header-body {
          margin-top: 0.7rem;
        }

        .hc-tags {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
          margin-top: 0.85rem;
        }

        .hc-tag {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.24rem 0.55rem;
          font-size: 0.74rem;
          font-weight: 680;
          color: var(--hc-green);
          background: #EEF7F4;
          border: 1px solid #D8EBE5;
          white-space: nowrap;
        }

        .hc-card,
        .hc-info-card,
        .hc-kpi,
        .hc-history-card {
          border: 1px solid var(--hc-border);
          border-radius: 8px;
          background: var(--hc-card);
          box-shadow: 0 8px 24px rgba(47, 93, 80, 0.055);
        }

        .hc-card {
          min-height: 150px;
          padding: 1rem;
          margin-bottom: 0.9rem;
        }

        .hc-card h3 {
          margin: 0 0 0.45rem;
          font-size: 1rem;
          color: var(--hc-text);
        }

        .hc-card p,
        .hc-history-card p {
          margin: 0;
          color: var(--hc-muted);
          font-size: 0.86rem;
          line-height: 1.45;
        }

        .hc-section-heading {
          margin: 1.25rem 0 0.6rem;
        }

        .hc-section-heading h2 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 780;
          color: var(--hc-green);
        }

        .hc-section-heading p {
          margin: 0.2rem 0 0;
          color: var(--hc-muted);
          font-size: 0.86rem;
        }

        .hc-step-title {
          margin: 1.05rem 0 0.55rem;
          display: flex;
          align-items: baseline;
          gap: 0.55rem;
          flex-wrap: wrap;
        }

        .hc-step-title span {
          color: var(--hc-teal);
          font-size: 0.78rem;
          font-weight: 780;
          text-transform: uppercase;
        }

        .hc-step-title strong {
          color: var(--hc-green);
          font-size: 1.02rem;
        }

        .hc-step-title p {
          flex-basis: 100%;
          margin: -0.15rem 0 0;
          color: var(--hc-muted);
          font-size: 0.84rem;
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

        .hc-success {
          border-color: #CFE7D8;
          background: #F3FAF5;
        }

        .hc-success strong,
        .hc-success div {
          color: var(--hc-success);
        }

        .hc-warning {
          border-color: #F0D9AF;
          background: #FFF9EF;
        }

        .hc-warning strong,
        .hc-warning div {
          color: var(--hc-warning);
        }

        .hc-error {
          border-color: #EDCBCB;
          background: #FFF5F5;
        }

        .hc-error strong,
        .hc-error div {
          color: var(--hc-error);
        }

        .hc-file-pill {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
          padding: 0.62rem 0.75rem;
          border: 1px solid var(--hc-border);
          border-radius: 8px;
          background: #FBFDFB;
          color: var(--hc-muted);
          font-size: 0.84rem;
          margin: 0.35rem 0;
        }

        .hc-file-pill strong {
          color: var(--hc-text);
        }

        .hc-file-pill span {
          color: var(--hc-muted);
        }

        .hc-file-pill code {
          color: var(--hc-green);
          white-space: normal;
        }

        .hc-kpi {
          padding: 0.8rem;
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
          border-radius: 8px;
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
          border-radius: 8px;
          border: 1px solid #CFE1DA;
          background: #FFFFFF;
          color: var(--hc-green);
          font-weight: 680;
          box-shadow: 0 2px 8px rgba(47, 93, 80, 0.05);
        }

        div.stButton > button[kind="primary"] {
          background: var(--hc-green);
          color: #FFFFFF;
          border: 1px solid var(--hc-green);
        }

        div.stButton > button:hover,
        div.stDownloadButton > button:hover {
          border-color: var(--hc-teal);
          color: var(--hc-green);
          background: #F4FBF8;
        }

        div[data-testid="stFileUploader"] {
          border: 1px dashed #C9DDD4;
          border-radius: 8px;
          padding: 0.65rem;
          background: #FBFDFB;
        }

        div[data-testid="stExpander"] {
          border: 1px solid var(--hc-border);
          border-radius: 8px;
          background: #FFFFFF;
        }

        div[data-testid="stDataFrame"] {
          border: 1px solid var(--hc-border);
          border-radius: 8px;
          overflow: hidden;
        }

        .stTabs [data-baseweb="tab-list"] {
          gap: 0.35rem;
        }

        .stTabs [data-baseweb="tab"] {
          border-radius: 8px;
          border: 1px solid var(--hc-border);
          background: #FFFFFF;
          color: var(--hc-muted);
        }

        @media (max-width: 760px) {
          .main .block-container {
            padding-left: 1rem;
            padding-right: 1rem;
          }

          .hc-history-card {
            grid-template-columns: 1fr;
          }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
