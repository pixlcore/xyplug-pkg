#!/usr/bin/env node

// System Package Management Plugin for xyOps
// Copyright (c) 2026 PixlCore LLC
// MIT License

const fs = require('fs');
const Path = require('path');
const os = require('os');
const cp = require('child_process');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const STATE_FILE = Path.join( os.tmpdir(), 'xyops-xyplug-pkg-state.json' );
const IS_WINDOWS = !!(process.platform == 'win32');
const MPM_VERSION = "6.3.0";
const MPM_BASE_URL = "https://github.com/kdeldycke/meta-package-manager";

const app = {
	finalSent: false,
	
	async run() {
		// read job from stdin
		const chunks = [];
		for await (const chunk of process.stdin) chunks.push(chunk);
		let job = this.job = JSON.parse( chunks.join('') );
		let params = this.params = this.job.params || {};
		
		if (!params.launcher) params.launcher = 'Binary';
		if (!params.managers) params.managers = { '*': true };
		if (!job.temp_dir) job.temp_dir = os.tmpdir();
		
		this.log("xyOps Package Manager starting run.");
		
		// configure the MPM launcher up front, but only initialize it for tools
		// that actually need MPM.  The combo tool only combines prior job output.
		this.setupLauncher();
		if (params.tool != 'combo') await this.prepareLauncher();
		
		// first query for a list of installed package managers, and filter out user-disabled ones
		if (params.tool != 'combo') {
			let raw_mgrs = this.mpmCommand(['managers']);
			let mgrs = Object.values(raw_mgrs).filter( mgr => !!mgr.available ).filter( function(mgr) { 
				if (params.managers[mgr.id] === false) return false;
				return !!params.managers[mgr.id] || !!params.managers['*']; 
			} );
			let mgr_ids = mgrs.map( mgr => mgr.id );
			if (!mgrs.length) return this.fail('mpm', "No supported package managers detected.");
			this.log("Detected package managers: " + mgr_ids.join(', '));
			this.mgrIds = mgr_ids;
		}
		
		// jump over to tool function
		let func = 'handler_' + params.tool;
		if (!this[func]) return this.fail('tool', "Unknown tool selection: " + params.tool);
		
		this.log("Calling tool: " + params.tool);
		await this[func]();
		
		this.log("Exiting.");
		this.sendFinal({ code: 0 });
	},
	
	async handler_outdated() {
		// get outdated package list
		let job = this.job;
		let params = this.params;
		let raw_outdated = this.mpmCommand( this.mgrIds.map( id => '--' + id ).concat('outdated') );
		let num_outdated = 0;
		let num_mgrs = 0;
		
		Object.values(raw_outdated).forEach( function(mgr) {
			if (!mgr.packages || !mgr.packages.length) return;
			num_mgrs++;
			num_outdated += mgr.packages.length;
		});
		
		this.log("Total outdated packages: " + num_outdated);
		if (!num_outdated) return; // nothing to do
		
		// construct markdown report
		let md = '';
		
		md += `- **Report**: Outdated Packages\n`;
		md += `- **Server**: {{server("${job.server}")}}\n`;
		md += `- **Date/Time**: ${(new Date()).toString()}\n`;
		
		md += `\nA total of ${num_outdated} outdated packages were found across ${num_mgrs} package managers:\n`;
		
		Object.values(raw_outdated).forEach( function(mgr) {
			if (!mgr.packages || !mgr.packages.length) return;
			md += `\n### ${mgr.name}\n`;
			md += `\n| Package Manager | Package Name | Current Version | Latest Version |\n`;
			md += `|-|-|-|-|\n`;
			
			mgr.packages.forEach( function(pkg) {
				md += `| ${mgr.id} | ${pkg.id} | ${pkg.installed_version} | ${pkg.latest_version} |\n`;
			} );
		} );
		
		// add markdown report to job output
		process.stdout.write( JSON.stringify({ 
			xy: 1, 
			markdown: {
				title: "Outdated Package Report",
				content: md,
				caption: ""
			},
			data: {
				job: job.id,
				server: job.server,
				outdated: num_outdated,
				report: raw_outdated
			}
		}) + "\n" );
		
		// send email via action
		if (params.send_email && params.email_addrs) {
			// only send one email per unique version combo
			this.loadState();
			
			let report_hash = crypto.createHash('sha256').update( md ).digest('hex');
			if (this.state.last_outdated_hash && (this.state.last_outdated_hash == report_hash)) {
				this.log("This exact outdated report was emailed previously (skipping email)");
			}
			else {
				this.log("Sending email to: " + params.email_addrs);
				
				let body = '';
				body += `<!-- To: {{email_to}} -->\n`;
				body += `<!-- Subject: 📦 {{config.client.name}} Outdated Package Report: {{server("${job.server}")}} -->\n`;
				body += `<!-- Title: Outdated Package Report -->\n`;
				body += `<!-- Button: Job Details | {{links.job_details}} -->\n`;
				body += `\n{{user_content}}\n`;
				
				process.stdout.write( JSON.stringify({ xy: 1, push: {
					actions: [
						{
							condition: "success",
							type: 'email',
							enabled: true,
							users: [],
							email: params.email_addrs,
							template: 'internal_job',
							body: body
						}
					]
				} }) + "\n" );
			}
			
			this.state.last_outdated_hash = report_hash;
			this.saveState();
		} // send email
		
		// perform upgrades
		if (params.do_upgrade) {
			this.log("Performing package upgrades now...");
			let args = this.mgrIds.map( id => '--' + id ).concat('upgrade');
			this.execMpm( args, {
				stdio: ['ignore', 'inherit', 'inherit'],
				timeout: 1800 * 1000, // 30 minutes
				maxBuffer: 1024 * 1024 * 128, // 128 MB
				encoding: 'utf8',
				windowsHide: IS_WINDOWS
			} );
		}
	},
	
	async handler_list() {
		// get full installed package list
		let job = this.job;
		let params = this.params;
		let raw_list = this.mpmCommand( this.mgrIds.map( id => '--' + id ).concat('installed') );
		let num_pkgs = 0;
		let num_mgrs = 0;
		
		Object.values(raw_list).forEach( function(mgr) {
			if (!mgr.packages || !mgr.packages.length) return;
			num_mgrs++;
			num_pkgs += mgr.packages.length;
		});
		
		this.log("Total installed packages: " + num_pkgs);
		if (!num_pkgs) return;
		
		// construct markdown report
		let md = '';
		
		md += `- **Report**: Installed Packages\n`;
		md += `- **Server**: {{server("${job.server}")}}\n`;
		md += `- **Date/Time**: ${(new Date()).toString()}\n`;
		
		md += `\nA total of ${num_pkgs} packages were found across ${num_mgrs} package managers:\n`;
		
		Object.values(raw_list).forEach( function(mgr) {
			if (!mgr.packages || !mgr.packages.length) return;
			md += `\n### ${mgr.name}\n`;
			md += `\n| Package Manager | Package Name | Installed Version |\n`;
			md += `|-|-|-|\n`;
			
			mgr.packages.forEach( function(pkg) {
				md += `| ${mgr.id} | ${pkg.id} | ${pkg.installed_version} |\n`;
			} );
		} );
		
		// add markdown report to job output
		process.stdout.write( JSON.stringify({ 
			xy: 1, 
			markdown: {
				title: "Installed Package Report",
				content: md,
				caption: ""
			},
			data: {
				server: job.server,
				report: raw_list
			}
		}) + "\n" );
		
		// send email via action
		if (params.send_email && params.email_addrs) {
			// only send one email per unique version combo
			this.log("Sending email to: " + params.email_addrs);
			
			let body = '';
			body += `<!-- To: {{email_to}} -->\n`;
			body += `<!-- Subject: 📦 {{config.client.name}} Installed Package Report: {{server("${job.server}")}} -->\n`;
			body += `<!-- Title: Installed Package Report -->\n`;
			body += `<!-- Button: Job Details | {{links.job_details}} -->\n`;
			body += `\n{{user_content}}\n`;
			
			process.stdout.write( JSON.stringify({ xy: 1, push: {
				actions: [
					{
						condition: "success",
						type: 'email',
						enabled: true,
						users: [],
						email: params.email_addrs,
						template: 'internal_job',
						body: body
					}
				]
			} }) + "\n" );
		} // send email
	},
	
	async handler_sbom() {
		// generate sbom file and attach to job output
		let job = this.job;
		let params = this.params;
		
		if (!params.sbom_format) params.sbom_format = 'SPDX';
		if (!params.file_format) params.file_format = 'JSON';
		let file = `sbom-${params.sbom_format.toLowerCase()}-${job.server}.${params.file_format.toLowerCase()}`;
		let args = this.mgrIds.map( id => '--' + id );
		args.push( 'sbom' );
		args.push( '--' + params.sbom_format.toLowerCase() );
		args.push( '--format', params.file_format.toLowerCase() );
		args.push( file );
		
		this.log("Generating SBOM file: " + file);
		
		this.execMpm( args, {
			stdio: ['ignore', 'inherit', 'inherit'],
			timeout: 1800 * 1000, // 30 minutes
			maxBuffer: 1024 * 1024 * 128, // 128 MB
			encoding: 'utf8',
			windowsHide: IS_WINDOWS
		} );
		
		if (!fs.existsSync(file)) return this.fail('sbom', "SBOM file was not generated: " + file);
		
		process.stdout.write( JSON.stringify({
			xy: 1,
			files: [file]
		}) + "\n" );
	},
	
	async handler_install() {
		// install a specific set of packages
		let job = this.job;
		let params = this.params;
		
		if (!params.ids) return this.fail('install', "No package IDs specified to install.");
		let ids = params.ids.trim().split(/\,\s*/);
		
		let args = this.mgrIds.map( id => '--' + id );
		args.push( 'install' );
		args.push( ids );
		
		this.log("Installing packages: " + params.ids);
		
		this.execMpm( args, {
			stdio: ['ignore', 'inherit', 'inherit'],
			timeout: 1800 * 1000, // 30 minutes
			maxBuffer: 1024 * 1024 * 128, // 128 MB
			encoding: 'utf8',
			windowsHide: IS_WINDOWS
		} );
	},
	
	async handler_upgrade() {
		// upgrade a specific set of packages
		let job = this.job;
		let params = this.params;
		
		if (!params.ids) return this.fail('install', "No package IDs specified to upgrade.");
		let ids = params.ids.trim().split(/\,\s*/);
		
		let args = this.mgrIds.map( id => '--' + id );
		args.push( 'upgrade' );
		args.push( ids );
		
		this.log("Upgrading packages: " + params.ids);
		
		this.execMpm( args, {
			stdio: ['ignore', 'inherit', 'inherit'],
			timeout: 1800 * 1000, // 30 minutes
			maxBuffer: 1024 * 1024 * 128, // 128 MB
			encoding: 'utf8',
			windowsHide: IS_WINDOWS
		} );
	},
	
	async handler_remove() {
		// remove a specific set of packages
		let job = this.job;
		let params = this.params;
		
		if (!params.ids) return this.fail('install', "No package IDs specified to remove.");
		let ids = params.ids.trim().split(/\,\s*/);
		
		let args = this.mgrIds.map( id => '--' + id );
		args.push( 'remove' );
		args.push( ids );
		
		this.log("Removing packages: " + params.ids);
		
		this.execMpm( args, {
			stdio: ['ignore', 'inherit', 'inherit'],
			timeout: 1800 * 1000, // 30 minutes
			maxBuffer: 1024 * 1024 * 128, // 128 MB
			encoding: 'utf8',
			windowsHide: IS_WINDOWS
		} );
	},
	
	async handler_backup() {
		// create a backup of all installed packages and attach the file to the job
		let job = this.job;
		let params = this.params;
		let file = `packages-${job.server}.toml`;
		
		let args = this.mgrIds.map( id => '--' + id );
		args.push( 'backup' );
		args.push( file );
		
		this.log("Generating backup file: " + file);
		
		this.execMpm( args, {
			stdio: ['ignore', 'inherit', 'inherit'],
			timeout: 1800 * 1000, // 30 minutes
			maxBuffer: 1024 * 1024 * 128, // 128 MB
			encoding: 'utf8',
			windowsHide: IS_WINDOWS
		} );
		
		if (!fs.existsSync(file)) return this.fail('backup', "Backup file was not generated: " + file);
		
		process.stdout.write( JSON.stringify({
			xy: 1,
			files: [file]
		}) + "\n" );
	},
	
	async handler_restore() {
		// restore state from a backup (must be file input to job)
		let job = this.job;
		let params = this.params;
		
		if (!job.input || !job.input.files || !job.input.files.length) {
			return this.fail('restore', "No backup file specified in job input.");
		}
		
		let file = job.input.files[0].filename;
		if (!fs.existsSync(file)) return this.fail('restore', "File not found: " + file);
		
		this.log("Restoring from backup file: " + file);
		
		let args = this.mgrIds.map( id => '--' + id );
		args.push( 'restore' );
		args.push( file );
		
		this.execMpm( args, {
			stdio: ['ignore', 'inherit', 'inherit'],
			timeout: 1800 * 1000, // 30 minutes
			maxBuffer: 1024 * 1024 * 128, // 128 MB
			encoding: 'utf8',
			windowsHide: IS_WINDOWS
		} );
	},
	
	async handler_combo() {
		// merge multiple input reports into a single combo report
		let job = this.job;
		let params = this.params;
		
		if (!job.input || !job.input.data || !job.input.data.items || !job.input.data.items.length) {
			return this.fail('combo', "No input reports found in input data items (must use a join controller)");
		}
		
		let jobs = {};
		let servers = {};
		let packages = {};
		let pkg_vers = {};
		let total_pkgs = 0;
		let total_servers = 0;
		
		job.input.data.items.forEach( function(item) {
			if (!item.job || !item.server || !item.outdated || !item.report) return;
			let server_id = item.server;
			let report = item.report;
			
			jobs[server_id] = item.job;
			servers[server_id] = item.outdated;
			total_servers++;
			
			Object.values(report).forEach( function(mgr) {
				if (!mgr.packages || !mgr.packages.length) return;
				
				mgr.packages.forEach( function(pkg) {
					// md += `| ${mgr.id} | \`${pkg.id}\` | ${pkg.installed_version} | ${pkg.latest_version} |\n`;
					let pkg_id = mgr.id + '|' + pkg.id;
					packages[pkg_id] = (packages[pkg_id] || 0) + 1;
					pkg_vers[pkg_id] = pkg.latest_version;
					total_pkgs++;
				} ); // foreach pkg
			}); // foreach mgr
		}); // foreach server
		
		this.log("Total servers: " + total_servers);
		this.log("Total outdated packages: " + total_pkgs);
		if (!total_pkgs) return; // nothing to do
		
		// construct markdown report
		let md = '';
		
		md += `- **Report**: Combo Outdated Packages\n`;
		md += `- **Total Servers**: ${total_servers}\n`;
		md += `- **Outdated Packages**: ${total_pkgs}\n`;
		md += `- **Date/Time**: ${(new Date()).toString()}\n`;
		
		md += `\nA total of ${total_pkgs} outdated packages were found across ${total_servers} servers:\n`;
		
		md += `\n### Servers\n`;
		md += `\n| Server Label/Hostname | Outdated Packages | Links |\n`;
		md += `|-|-|-|\n`;
		
		for (let server_id in servers) {
			let num_srv_pkgs = servers[server_id];
			let job_id = jobs[server_id];
			
			md += `| [{{ server("${server_id}") }}]({{ config.base_app_url }}/#Servers?id=${server_id}) | ${num_srv_pkgs} | [View Server Report]({{ config.base_app_url }}/#Job?id=${job_id}) |\n`;
		}
		
		md += `\n### Packages\n`;
		md += `\n| Package Manager | Package Name | Latest Version | Affected Servers |\n`;
		md += `|-|-|-|-|\n`;
		
		for (let combo_id in packages) {
			let [ mgr_id, pkg_id ] = combo_id.split('|');
			let srv_count = packages[combo_id];
			let pkg_ver = pkg_vers[combo_id];
			
			md += `| ${mgr_id} | ${pkg_id} | ${pkg_ver} | ${srv_count} |\n`;
		}
		
		// add markdown report to job output
		process.stdout.write( JSON.stringify({ 
			xy: 1, 
			markdown: {
				title: "Combo Outdated Package Report",
				content: md,
				caption: ""
			},
			data: {
				job: null,
				server: null,
				outdated: null,
				report: null,
				total_pkgs,
				total_servers
			}
		}) + "\n" );
		
		// send email via action
		if (params.send_email && params.email_addrs) {
			// only send one email per unique version combo
			this.loadState();
			
			let combo_hash = crypto.createHash('sha256').update( md ).digest('hex');
			if (this.state.last_combo_hash && (this.state.last_combo_hash == combo_hash)) {
				this.log("This exact combo report was emailed previously (skipping email)");
			}
			else {
				this.log("Sending email to: " + params.email_addrs);
				
				let body = '';
				body += `<!-- To: {{email_to}} -->\n`;
				body += `<!-- Subject: 📦 {{config.client.name}} Combo Outdated Package Report -->\n`;
				body += `<!-- Title: Combo Outdated Package Report -->\n`;
				body += `<!-- Button: Job Details | {{links.job_details}} -->\n`;
				body += `\n{{user_content}}\n`;
				
				process.stdout.write( JSON.stringify({ xy: 1, push: {
					actions: [
						{
							condition: "success",
							type: 'email',
							enabled: true,
							users: [],
							email: params.email_addrs,
							template: 'internal_job',
							body: body
						}
					]
				} }) + "\n" );
			}
			
			this.state.last_combo_hash = combo_hash;
			this.saveState();
		} // send email
	},
	
	mpmCommand(args) {
		// send mpm command and parse and return response
		args.unshift('--output-format', 'json');
		
		let output = this.execMpm( args, {
			stdio: ['ignore', 'pipe', 'inherit'],
			timeout: 300 * 1000, // 5 minutes
			maxBuffer: 1024 * 1024 * 128, // 128 MB
			encoding: 'utf8',
			windowsHide: IS_WINDOWS
		} );
		
		return JSON.parse(output);
	},
	
	setupLauncher() {
		// normalize the Event parameter into one of our supported launcher modes
		this.launcher = String(this.params.launcher || 'Binary').toLowerCase().trim();
		
		if (this.launcher == 'binary') {
			this.mpmBin = ''; // will be set in download
			this.mpmBaseArgs = [];
		}
		else if (this.launcher == 'uvx') {
			this.mpmBin = 'uvx';
			this.mpmBaseArgs = ['meta-package-manager==' + MPM_VERSION];
		}
		else {
			throw new Error("Unknown MPM launcher selection: " + this.params.launcher);
		}
		
		this.log("Using MPM launcher: " + this.launcher);
	},
	
	async prepareLauncher() {
		// initialize the selected launcher before the first MPM command runs
		if (this.launcher == 'binary') return await this.download();
		if (this.launcher == 'uvx') return;
		throw new Error("Unsupported MPM launcher: " + this.launcher);
	},
	
	execMpm(args, options) {
		// run MPM through the configured launcher while keeping all callers simple
		let full_args = (this.mpmBaseArgs || []).concat(args || []);
		let output = '';
		
		try {
			output = cp.execFileSync( this.mpmBin, full_args, options );
		}
		catch (err) {
			// give a clearer message if uvx was selected but is not installed
			if (err && (err.code == 'ENOENT') && (this.launcher == 'uvx')) {
				throw new Error("The 'uvx' executable could not be found in PATH on the target server.");
			}
			throw err;
		}
		
		return output;
	},
	
	async download() {
		// download MPM binary for the standalone launcher
		// https://github.com/kdeldycke/meta-package-manager/releases/download/v6.3.0/mpm-6.3.0-linux-arm64.bin
		let plat = '';
		switch (process.platform) {
			case 'linux': plat = 'linux'; break;
			case 'darwin': plat = 'macos'; break;
			case 'win32': plat = 'windows'; break;
		}
		let arch = process.arch;
		let ext = (IS_WINDOWS ? 'exe' : 'bin');
		let url = MPM_BASE_URL + `/releases/download/v${MPM_VERSION}/mpm-${MPM_VERSION}-${plat}-${arch}.${ext}`;
		
		this.mpmBin = Path.join( this.job.temp_dir, 'xyplug-pkg-mpm-' + MPM_VERSION + '-' + plat + '-' + arch + '.' + (IS_WINDOWS ? 'exe' : 'bin') );
		if (fs.existsSync(this.mpmBin)) return;
		
		this.log(`Downloading MPM binary from GitHub (${plat}/${arch})...`);
		
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(`Failed: ${res.status} ${res.statusText}`);
		}
		await pipeline(res.body, fs.createWriteStream(this.mpmBin));
		
		fs.chmodSync( this.mpmBin, 0o755 );
	},
	
	log(msg) {
		console.log( msg );
	},
	
	loadState() {
		// load state from temp file
		this.state = {};
		if (fs.existsSync(STATE_FILE)) {
			try { this.state = JSON.parse( fs.readFileSync(STATE_FILE, 'utf8') ); }
			catch (e) { this.state = {}; }
		}
	},
	
	saveState() {
		// save state to temp file
		fs.writeFileSync( STATE_FILE, JSON.stringify(this.state) + "\n" );
	},
	
	sendFinal(payload) {
		// send final xywp message
		if (this.finalSent) return;
		this.finalSent = true;
		payload.xy = 1;
		process.stdout.write( JSON.stringify(payload) + "\n", () => process.exit(0));
	},
	
	fail(code, description) {
		// we ded
		this.sendFinal({ code, description });
	}
};

app.run().catch((err) => {
	console.error( err, err.stack );
	app.fail('error', err && err.message ? err.message : 'Unknown error');
});
