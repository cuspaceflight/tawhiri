import jinja2

def kml(points, markers, filename=None):
    loader = jinja2.PackageLoader('tawhiri', '')
    env = jinja2.Environment(loader=loader,
                             extensions=['jinja2.ext.autoescape'],
                             undefined=jinja2.StrictUndefined)

    template = env.get_template("template.kml")
    kwargs = {'points': points, 'markers': markers}
    if filename:
        template.stream(**kwargs).dump(filename)
    else:
        template.render(**kwargs)
