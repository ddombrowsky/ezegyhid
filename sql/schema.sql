--
-- PostgreSQL database dump
--

-- Dumped from database version 12.9 (Ubuntu 12.9-0ubuntu0.20.04.1)
-- Dumped by pg_dump version 12.9 (Ubuntu 12.9-0ubuntu0.20.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: davek
--

CREATE TABLE public.account (
    memo character varying,
    ftm_address character varying,
    amount real
);


--
-- Name: log; Type: TABLE; Schema: public; Owner: davek
--

CREATE TABLE public.log (
    dt timestamp without time zone DEFAULT clock_timestamp() NOT NULL,
    account_id character varying,
    message character varying
);


--
-- Name: tx; Type: TABLE; Schema: public; Owner: davek
--

CREATE TABLE public.tx (
    txid character varying,
    state integer,
    complete boolean
);


--
-- Name: account_ix0; Type: INDEX; Schema: public; Owner: davek
--

CREATE UNIQUE INDEX account_ix0 ON public.account USING btree (memo);


--
-- Name: tx_ix0; Type: INDEX; Schema: public; Owner: davek
--

CREATE UNIQUE INDEX tx_ix0 ON public.tx USING btree (txid);


--
-- PostgreSQL database dump complete
--

