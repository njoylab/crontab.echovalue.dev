(function () {
	var toggle = document.querySelector('.navbar-toggle');
	var nav = document.querySelector('.navbar-nav');
	if (!toggle || !nav) return;
	toggle.addEventListener('click', function () {
		toggle.classList.toggle('active');
		nav.classList.toggle('active');
		toggle.setAttribute('aria-expanded', String(nav.classList.contains('active')));
	});
	nav.querySelectorAll('a').forEach(function (link) {
		link.addEventListener('click', function () {
			toggle.classList.remove('active');
			nav.classList.remove('active');
			toggle.setAttribute('aria-expanded', 'false');
		});
	});
})();
